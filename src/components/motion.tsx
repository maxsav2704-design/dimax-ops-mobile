import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, type ViewProps } from "react-native";

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

export function Reveal({ children, style, ...props }: ViewProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 220, easing: Easing.out(Easing.cubic),
      useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);
  return (
    <Animated.View {...props} style={[style, {
      opacity: progress,
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
    }]}>{children}</Animated.View>
  );
}
