import React, { forwardRef, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, type PressableProps, StyleSheet, type View } from "react-native";
import { useReducedMotion } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Keeps the native hit target and ref intact for Expo Router's Link asChild. */
export const FeedbackPressable = forwardRef<View, PressableProps & { feedback?: "press" | "none" }>(
  function FeedbackPressable({
    style, disabled, accessibilityState, onPress, onPressIn, onPressOut, onHoverIn, onHoverOut,
    feedback = "press", ...props
  }, ref) {
    const reducedMotion = useReducedMotion();
    const [pressed, setPressed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const scale = useRef(new Animated.Value(1)).current;
    const blocked = Boolean(disabled || accessibilityState?.disabled || accessibilityState?.busy);
    const active = pressed && !blocked && feedback !== "none";
    useEffect(() => {
      if (blocked) setPressed(false);
      if (reducedMotion || feedback === "none") { scale.setValue(1); return; }
      const animation = Animated.timing(scale, {
        toValue: active ? 0.975 : 1,
        duration: active ? 90 : 170,
        easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
      });
      animation.start();
      return () => animation.stop();
    }, [active, blocked, feedback, reducedMotion, scale]);
    const state = { pressed: active, hovered: hovered && !blocked };
    const resolvedStyle = StyleSheet.flatten(typeof style === "function" ? style(state) : style);
    const transforms = resolvedStyle?.transform;
    return (
      <AnimatedPressable
        {...props}
        ref={ref}
        disabled={blocked}
        accessibilityState={{ ...accessibilityState, disabled: blocked }}
        aria-selected={props["aria-selected"] ?? accessibilityState?.selected}
        aria-busy={props["aria-busy"] ?? accessibilityState?.busy}
        aria-disabled={blocked}
        onPress={(event) => { if (!blocked) onPress?.(event); }}
        onPressIn={(event) => { if (!blocked) { setPressed(true); onPressIn?.(event); } }}
        onPressOut={(event) => { setPressed(false); onPressOut?.(event); }}
        onHoverIn={(event) => { if (!blocked) { setHovered(true); onHoverIn?.(event); } }}
        onHoverOut={(event) => { setHovered(false); onHoverOut?.(event); }}
        style={[
          resolvedStyle,
          active && { opacity: (typeof resolvedStyle?.opacity === "number" ? resolvedStyle.opacity : 1) * 0.86 },
          !reducedMotion && feedback !== "none" && {
            transform: [...(Array.isArray(transforms) ? transforms : []), { scale }],
          },
        ]}
      />
    );
  },
);
