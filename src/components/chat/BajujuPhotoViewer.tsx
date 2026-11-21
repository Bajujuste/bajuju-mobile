import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type Touch = { pageX: number; pageY: number };

function distance(a: Touch, b: Touch) {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function midpoint(a: Touch, b: Touch) {
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
}

/**
 * Foto a schermo intero: pizzico con due dita per ingrandire (fino a 5x),
 * un dito per spostarla quando è ingrandita, doppio tocco per ingrandire/tornare normale.
 * Solo JS (PanResponder), nessun modulo nativo nuovo.
 */
export function BajujuPhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(true);

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const state = useRef({
    scale: 1,
    x: 0,
    y: 0,
    pinchStartDistance: 0,
    pinchStartScale: 1,
    lastMid: null as { x: number; y: number } | null,
    panStart: { x: 0, y: 0 },
    panOrigin: null as { x: number; y: number } | null,
    moved: false,
    lastTap: 0,
    touchCount: 0,
  });

  const apply = (nextScale: number, nextX: number, nextY: number) => {
    const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const maxX = ((s - 1) * screenWidth) / 2;
    const maxY = ((s - 1) * screenHeight) / 2;
    const x = clamp(nextX, -maxX, maxX);
    const y = clamp(nextY, -maxY, maxY);
    state.current.scale = s;
    state.current.x = x;
    state.current.y = y;
    scale.setValue(s);
    translateX.setValue(x);
    translateY.setValue(y);
  };

  const reset = () => {
    state.current.scale = 1;
    state.current.x = 0;
    state.current.y = 0;
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    setLoading(true);
    state.current.scale = 1;
    state.current.x = 0;
    state.current.y = 0;
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
  }, [uri, scale, translateX, translateY]);

  const responder = useMemo(() => {
    const beginTouches = (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches as unknown as Touch[];
      const s = state.current;
      s.touchCount = touches.length;
      if (touches.length >= 2) {
        s.pinchStartDistance = Math.max(1, distance(touches[0], touches[1]));
        s.pinchStartScale = s.scale;
        s.lastMid = midpoint(touches[0], touches[1]);
        s.panOrigin = null;
      } else if (touches.length === 1) {
        s.panOrigin = { x: touches[0].pageX, y: touches[0].pageY };
        s.panStart = { x: s.x, y: s.y };
        s.lastMid = null;
      }
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        state.current.moved = false;
        beginTouches(event);
      },
      onPanResponderMove: (event) => {
        const touches = event.nativeEvent.touches as unknown as Touch[];
        const s = state.current;
        if (touches.length !== s.touchCount) beginTouches(event);

        if (touches.length >= 2) {
          s.moved = true;
          const nextScale = s.pinchStartScale * (distance(touches[0], touches[1]) / s.pinchStartDistance);
          const mid = midpoint(touches[0], touches[1]);
          const last = s.lastMid || mid;
          s.lastMid = mid;
          apply(nextScale, s.x + (mid.x - last.x), s.y + (mid.y - last.y));
        } else if (touches.length === 1 && s.panOrigin) {
          const dx = touches[0].pageX - s.panOrigin.x;
          const dy = touches[0].pageY - s.panOrigin.y;
          if (Math.abs(dx) > 6 || Math.abs(dy) > 6) s.moved = true;
          if (s.scale > 1) apply(s.scale, s.panStart.x + dx, s.panStart.y + dy);
        }
      },
      onPanResponderRelease: () => {
        const s = state.current;
        s.touchCount = 0;
        if (s.scale < 1.05) reset();

        if (!s.moved) {
          const now = Date.now();
          if (now - s.lastTap < DOUBLE_TAP_MS) {
            s.lastTap = 0;
            if (s.scale > 1.05) reset();
            else apply(DOUBLE_TAP_SCALE, 0, 0);
          } else {
            s.lastTap = now;
          }
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth, screenHeight]);

  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.backdrop}>
        <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
          {uri ? (
            <Animated.Image
              source={{ uri }}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              style={{
                width: screenWidth,
                height: screenHeight,
                transform: [{ translateX }, { translateY }, { scale }],
              }}
            />
          ) : null}
        </View>
        {loading ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
        <Pressable
          onPress={onClose}
          style={styles.close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Chiudi foto"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.hint} pointerEvents="none">Pizzica con due dita per ingrandire</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    top: 48,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  hint: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
});
