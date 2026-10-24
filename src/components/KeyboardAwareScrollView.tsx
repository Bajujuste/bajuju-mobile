import { forwardRef, useCallback, useEffect, useRef, useState, type ForwardedRef } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  View,
  type GestureResponderEvent,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

// Spazio libero che lasciamo tra il campo attivo e la tastiera.
const EXTRA_SPACE = 24;

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * Bordo superiore della tastiera, nelle stesse coordinate di measureInWindow.
 * Su Android (edge-to-edge) l'altezza della tastiera e a volte anche screenY non contano la barra
 * di navigazione sotto la tastiera: la tastiera risultava più bassa del vero e copriva metà del campo.
 * Prendiamo la stima più alta tra le due, così il campo resta sempre sopra.
 */
export function getKeyboardTop(event: KeyboardEvent, bottomInset = initialWindowMetrics?.insets.bottom ?? 0) {
  const { screenY, height } = event.endCoordinates;
  if (Platform.OS === 'ios') return screenY > 0 ? screenY : Dimensions.get('window').height - height;
  const fromHeight = Dimensions.get('screen').height - height - bottomInset;
  return screenY > 0 ? Math.min(screenY, fromHeight) : fromHeight;
}

/**
 * Spazio in basso che la tastiera copre su una vista (0 a tastiera chiusa).
 * Per le schermate di chat con il campo fisso in fondo: va messo come paddingBottom
 * della vista che contiene messaggi e campo.
 */
export function useKeyboardOverlap(viewRef: { current: View | null }) {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let keyboardTop: number | null = null;

    const measure = () => {
      const view = viewRef.current;
      if (keyboardTop == null || !view) return;
      const top = keyboardTop;
      view.measureInWindow((_x, y, _w, h) => {
        // Il paddingBottom non cambia il riquadro esterno della vista: la misura resta stabile.
        setOverlap(Math.max(0, Math.round(y + h - top)));
      });
    };

    const onShow = (event: KeyboardEvent) => {
      keyboardTop = getKeyboardTop(event);
      measure();
      timers.push(setTimeout(measure, 350));
    };
    const onHide = () => {
      keyboardTop = null;
      setOverlap(0);
    };

    const subs =
      Platform.OS === 'ios'
        ? [Keyboard.addListener('keyboardWillShow', onShow), Keyboard.addListener('keyboardWillHide', onHide)]
        : [Keyboard.addListener('keyboardDidShow', onShow), Keyboard.addListener('keyboardDidHide', onHide)];

    return () => {
      subs.forEach((sub) => sub.remove());
      timers.forEach(clearTimeout);
    };
  }, [viewRef]);

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

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => {
      keyboardTop.current = getKeyboardTop(event);
      updateSpacer();
      later(revealFocusedInput, Platform.OS === 'ios' ? 60 : 120);
      // Seconda passata: su Android la finestra può ridimensionarsi dopo l'evento.
      later(() => {
        updateSpacer();
        later(revealFocusedInput, 60);
      }, 350);
    };
    const onHide = () => {
      keyboardTop.current = null;
      setSpacer(0);
    };

    const subs =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillShow', onShow),
            Keyboard.addListener('keyboardWillChangeFrame', onShow),
            Keyboard.addListener('keyboardWillHide', onHide),
          ]
        : [Keyboard.addListener('keyboardDidShow', onShow), Keyboard.addListener('keyboardDidHide', onHide)];

    const pending = timers.current;
    return () => {
      subs.forEach((sub) => sub.remove());
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [later, revealFocusedInput, updateSpacer]);

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
