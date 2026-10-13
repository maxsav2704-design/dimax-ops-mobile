import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, type ViewProps } from "react-native";

// One subscription for the whole app, not one listener per door or button.
const ReducedMotionContext = createContext(true);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      changed = true;
      setReducedMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active && !changed) setReducedMotion(value);
    }).catch(() => undefined);
    return () => { active = false; subscription.remove(); };
  }, []);
  return <ReducedMotionContext.Provider value={reducedMotion}>{children}</ReducedMotionContext.Provider>;
}

export const useReducedMotion = () => useContext(ReducedMotionContext);

/** Springs a confirmation mark into place; static with reduced motion. */
export function Pop({ children, style, ...props }: ViewProps) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) { scale.setValue(1); return; }
    scale.setValue(0.4);
    const animation = Animated.spring(scale, {
      toValue: 1, friction: 4, tension: 140, useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, scale]);
  return <Animated.View {...props} style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** Emits one expanding ring behind its child each time `trigger` changes to a truthy value. */
export function Pulse({ trigger, color, children, style, ...props }: ViewProps & { trigger: unknown; color: string }) {
  const reducedMotion = useReducedMotion();
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trigger || reducedMotion) { ring.setValue(0); return; }
    ring.setValue(0);
    const animation = Animated.timing(ring, {
      toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, ring, trigger]);
  return (
    <Animated.View {...props} style={style}>
      {trigger && !reducedMotion ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, {
            borderRadius: 999, backgroundColor: color,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
          }]}
        />
      ) : null}
      {children}
    </Animated.View>
  );
}

/** Progress fill whose width glides to `percent`; jumps straight there with reduced motion. */
export function AnimatedFill({ percent, style, ...props }: ViewProps & { percent: number }) {
  const reducedMotion = useReducedMotion();
  const target = Math.max(0, Math.min(100, percent));
  const value = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    if (reducedMotion) { value.setValue(target); return; }
    const animation = Animated.timing(value, {
      toValue: target, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, target, value]);
  const width = value.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
  return <Animated.View {...props} style={[style, { width }]} />;
}

const STAGGER_STEP_MS = 36;
const STAGGER_MAX_INDEX = 12;

/**
 * Fades content in. `index` staggers list items; `tilt` lifts the item into place
 * from a slight perspective tilt so rows read as cards settling, not flat fades.
 */
export function Reveal({ children, style, index, tilt = false, ...props }: ViewProps & { index?: number; tilt?: boolean }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const delay = Math.min(Math.max(index ?? 0, 0), STAGGER_MAX_INDEX) * STAGGER_STEP_MS;
  useEffect(() => {
    if (reducedMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1, duration: tilt ? 320 : 220, delay, easing: Easing.out(Easing.cubic),
      useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reducedMotion, tilt]);
  const transform = tilt
    ? [
      { perspective: 640 },
      { rotateX: progress.interpolate({ inputRange: [0, 1], outputRange: ["14deg", "0deg"] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
    ]
    : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }];
  return (
    <Animated.View {...props} style={[style, { opacity: progress, transform }]}>{children}</Animated.View>
  );
}

/** Eases a number towards `target` for counters; snaps immediately with reduced motion. */
export function useAnimatedNumber(target: number, duration = 650): number {
  const reducedMotion = useReducedMotion();
  const value = useRef(new Animated.Value(target)).current;
  const [displayed, setDisplayed] = useState(target);
  useEffect(() => {
    if (reducedMotion || !Number.isFinite(target)) {
      value.setValue(target);
      setDisplayed(target);
      return;
    }
    const subscription = value.addListener(({ value: current }) => setDisplayed(current));
    const animation = Animated.timing(value, {
      toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false, isInteraction: false,
    });
    animation.start(({ finished }) => { if (finished) setDisplayed(target); });
    return () => { value.removeListener(subscription); animation.stop(); };
  }, [duration, reducedMotion, target, value]);
  return displayed;
}
