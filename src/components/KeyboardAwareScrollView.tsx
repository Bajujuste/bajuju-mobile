import { forwardRef, useCallback, useEffect, useRef, useState, type ForwardedRef } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  TextInput,
  View,
  type GestureResponderEvent,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { KeyboardState, runOnJS, useAnimatedKeyboard, useAnimatedReaction } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Spazio libero che lasciamo tra il campo attivo e la tastiera.
const EXTRA_SPACE = 24;

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

type Insets = { top: number; bottom: number };

/**
 * Bordo superiore della tastiera, nelle stesse coordinate di measureInWindow.
 * Su Android i numeri della tastiera sono riferiti allo schermo intero, mentre measureInWindow
 * è riferito all'area dell'app, che su molti telefoni parte sotto la barra di stato e finisce
 * sopra la barra dei tasti di sistema. Inoltre l'altezza della tastiera non conta la barra dei tasti.
 * Per questo il campo restava in parte coperto: qui correggiamo tutte e due le cose
 * e scegliamo sempre la stima più prudente (tastiera più alta), così la schermata sale abbastanza.
 */
export function getKeyboardTop(event: KeyboardEvent, insets: Insets) {
  const { screenY, height } = event.endCoordinates;
  if (Platform.OS === 'ios') return screenY > 0 ? screenY : Dimensions.get('window').height - height;

  const screenHeight = Dimensions.get('screen').height;
  const windowHeight = Dimensions.get('window').height;
  // Barra dei tasti di sistema: dai margini sicuri se l'app ci disegna sotto, altrimenti dalla differenza schermo/finestra.
  const navigationBar = Math.max(insets.bottom, screenHeight - windowHeight, 0);
  const fromHeight = screenHeight - height - navigationBar;
  const topOnScreen = screenY > 0 ? Math.min(screenY, fromHeight) : fromHeight;
  // Se l'app parte sotto la barra di stato, le sue coordinate sono spostate di quell'altezza.
  const appOffset = Math.max(0, (StatusBar.currentHeight ?? 0) - insets.top);
  return topOnScreen - appOffset;
}

/** Bordo superiore della tastiera calcolato dalla sua altezza reale misurata dal fondo dello schermo. */
function keyboardTopFromHeight(height: number, insets: Insets) {
  const appOffset = Math.max(0, (StatusBar.currentHeight ?? 0) - insets.top);
  return Dimensions.get('screen').height - height - appOffset;
}

/**
 * Android: altezza VERA della tastiera, aggiornata ogni volta che cambia.
 * React Native manda "keyboardDidShow" una volta sola, quando la tastiera compare: se poi la tastiera
 * cresce (barra dei suggerimenti, emoji, appunti, cambio tastiera) non avvisa più, e il campo
 * restava sotto. Reanimated invece legge direttamente lo spazio occupato dalla tastiera
 * e ci avvisa a ogni cambio. Restituisce 0 a tastiera chiusa.
 */
function useAndroidLiveKeyboardHeight(onChange: (height: number) => void) {
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true });
  useAnimatedReaction(
    () => {
      const state = keyboard.state.value;
      if (state === KeyboardState.OPEN) return Math.round(keyboard.height.value);
      if (state === KeyboardState.CLOSED) return 0;
      return -1; // in movimento: aspettiamo la fine
    },
    (current, previous) => {
      if (current >= 0 && current !== previous) runOnJS(onChange)(current);
    },
  );
}

function useNoLiveKeyboardHeight(_onChange: (height: number) => void) {}

const useLiveKeyboardHeight = Platform.OS === 'android' ? useAndroidLiveKeyboardHeight : useNoLiveKeyboardHeight;

/**
 * Segue il bordo superiore della tastiera (coordinate di measureInWindow) e chiama onChange
 * a ogni cambio: null quando la tastiera è chiusa.
 * Usa due fonti e sceglie sempre la più prudente (tastiera più alta):
 * gli eventi di React Native e, su Android, l'altezza reale letta da Reanimated.
 */
function useKeyboardTop(onChange: (top: number | null) => void) {
  const insets = useSafeAreaInsets();
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const eventTop = useRef<number | null>(null);
  const liveHeight = useRef(0);

  const emit = useCallback(() => {
    const candidates: number[] = [];
    if (eventTop.current != null) candidates.push(eventTop.current);
    if (liveHeight.current > 0) candidates.push(keyboardTopFromHeight(liveHeight.current, insetsRef.current));
    onChangeRef.current(candidates.length ? Math.min(...candidates) : null);
  }, []);

  const onLiveHeight = useCallback(
    (height: number) => {
      liveHeight.current = height;
      emit();
    },
    [emit],
  );
  useLiveKeyboardHeight(onLiveHeight);

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => {
      eventTop.current = getKeyboardTop(event, insetsRef.current);
      emit();
    };
    const onHide = () => {
      eventTop.current = null;
      liveHeight.current = 0;
      emit();
    };

    const subs =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillShow', onShow),
            Keyboard.addListener('keyboardWillChangeFrame', onShow),
            Keyboard.addListener('keyboardWillHide', onHide),
          ]
        : [Keyboard.addListener('keyboardDidShow', onShow), Keyboard.addListener('keyboardDidHide', onHide)];

    return () => subs.forEach((sub) => sub.remove());
  }, [emit]);
}

/**
 * Spazio in basso che la tastiera copre su una vista (0 a tastiera chiusa).
 * Per le schermate di chat con il campo fisso in fondo: va messo come paddingBottom
 * della vista che contiene messaggi e campo.
 */
export function useKeyboardOverlap(viewRef: { current: View | null }) {
  const [overlap, setOverlap] = useState(0);
  const keyboardTop = useRef<number | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const measure = useCallback(() => {
    const view = viewRef.current;
    const top = keyboardTop.current;
    if (top == null) {
      setOverlap(0);
      return;
    }
    if (!view) return;
    view.measureInWindow((_x, y, _w, h) => {
      // Il paddingBottom non cambia il riquadro esterno della vista: la misura resta stabile.
      setOverlap(Math.max(0, Math.round(y + h - top)));
    });
  }, [viewRef]);

  useKeyboardTop(
    useCallback(
      (top: number | null) => {
        keyboardTop.current = top;
        measure();
        if (top != null) {
          // Seconda passata: la finestra può spostarsi dopo l'evento.
          const timer = setTimeout(() => {
            timers.current.delete(timer);
            measure();
          }, 350);
          timers.current.add(timer);
        }
      },
      [measure],
    ),
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return overlap;
}

/**
 * ScrollView che non lascia mai un campo di testo sotto la tastiera, su iOS e Android.
 * - Quando la tastiera si apre aggiunge in fondo lo spazio che la tastiera copre davvero
 *   (zero se il sistema ha già ristretto la finestra), così si può scorrere fino all'ultimo campo.
 * - Porta in vista il campo attivo all'apertura, quando si passa a un altro campo
 *   e mentre un campo su più righe cresce scrivendo.
 * Si usa al posto di ScrollView, con le stesse props e lo stesso ref.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(
  {
    children,
    onScroll,
    onContentSizeChange,
    onTouchEnd,
    onLayout,
    scrollEventThrottle,
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'none',
    ...props
  },
  forwardedRef,
) {
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(0);
  // Bordo superiore della tastiera in coordinate della finestra, null se è chiusa.
  const keyboardTop = useRef<number | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [spacer, setSpacer] = useState(0);

  const setRefs = useCallback(
    (node: ScrollView | null) => {
      scrollRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  }, []);

  const revealFocusedInput = useCallback(() => {
    const kbTop = keyboardTop.current;
    const scroll = scrollRef.current as any;
    const input = TextInput.State.currentlyFocusedInput?.() as any;
    if (kbTop == null || !scroll || !input?.measureLayout) return;

    const inner = scroll.getInnerViewRef?.() ?? scroll.getInnerViewNode?.();
    const outer = scroll.getNativeScrollRef?.() ?? scroll;
    if (!inner || !outer?.measureInWindow) return;

    outer.measureInWindow((_sx: number, sy: number, _sw: number, sh: number) => {
      const visibleHeight = Math.min(sy + sh, kbTop) - sy;
      if (visibleHeight <= EXTRA_SPACE * 2) return;

      // Fallisce (e non fa nulla) se il campo attivo non sta dentro questa ScrollView.
      input.measureLayout(
        inner,
        (_x: number, y: number, _w: number, h: number) => {
          const current = scrollY.current;
          const fieldTop = y - EXTRA_SPACE;
          const fieldBottom = y + h + EXTRA_SPACE;
          let target = current;
          if (fieldBottom > current + visibleHeight) target = fieldBottom - visibleHeight;
          else if (fieldTop < current) target = Math.max(0, fieldTop);
          if (Math.abs(target - current) > 1) scroll.scrollTo({ y: target, animated: true });
        },
        () => {},
      );
    });
  }, []);

  const updateSpacer = useCallback(() => {
    const kbTop = keyboardTop.current;
    const scroll = scrollRef.current as any;
    const outer = scroll?.getNativeScrollRef?.() ?? scroll;
    if (kbTop == null || !outer?.measureInWindow) {
      setSpacer(0);
      return;
    }
    outer.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      // Togliamo lo spazio aggiunto prima: misuriamo la ScrollView, non il suo contenuto.
      setSpacer(Math.max(0, Math.round(y + h - kbTop)));
    });
  }, []);

  useKeyboardTop(
    useCallback(
      (top: number | null) => {
        keyboardTop.current = top;
        if (top == null) {
          setSpacer(0);
          return;
        }
        updateSpacer();
        later(revealFocusedInput, Platform.OS === 'ios' ? 60 : 120);
        // Seconda passata: su Android la finestra può ridimensionarsi dopo l'evento.
        later(() => {
          updateSpacer();
          later(revealFocusedInput, 60);
        }, 350);
      },
      [later, revealFocusedInput, updateSpacer],
    ),
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      onContentSizeChange?.(width, height);
      // Un campo su più righe che cresce mentre si scrive resta sopra la tastiera.
      if (keyboardTop.current != null) later(revealFocusedInput, 0);
    },
    [later, onContentSizeChange, revealFocusedInput],
  );

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      onTouchEnd?.(event);
      // Passaggio a un altro campo con la tastiera già aperta.
      if (keyboardTop.current != null) later(revealFocusedInput, 250);
    },
    [later, onTouchEnd, revealFocusedInput],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      if (keyboardTop.current != null) later(updateSpacer, 0);
    },
    [later, onLayout, updateSpacer],
  );

  return (
    <ScrollView
      ref={setRefs}
      {...props}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      scrollEventThrottle={scrollEventThrottle ?? 16}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      onTouchEnd={handleTouchEnd}
      onLayout={handleLayout}
    >
      {children}
      {spacer > 0 ? <View style={{ height: spacer }} pointerEvents="none" /> : null}
    </ScrollView>
  );
});
