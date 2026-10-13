import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";
import { AnimatedFill, useReducedMotion } from "@/components/motion";
import { installerTheme } from "@/lib/theme";

const MAX_TICKS = 24;
const TICK_MS = 55;

/**
 * Progress as one bevelled tick per unit (a door), filled one after another; falls back to a
 * plain fill above MAX_TICKS. Reduced motion shows the final state at once.
 */
export function TickBar({ total, filled, color, style, testID }: {
  total: number;
  filled: number;
  color: string;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}) {
  const reducedMotion = useReducedMotion();
  const count = Math.max(0, Math.min(total, filled));
  const progress = useRef(new Animated.Value(count)).current;
  useEffect(() => {
    if (reducedMotion) { progress.setValue(count); return; }
    const animation = Animated.timing(progress, {
      toValue: count, duration: Math.max(1, Math.abs(count - Number((progress as unknown as { _value?: number })._value ?? 0))) * TICK_MS,
      easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [count, progress, reducedMotion]);
  if (total <= 0) return null;
  if (total > MAX_TICKS) {
    return (
      <View style={[styles.track, style]} testID={testID}>
        <AnimatedFill percent={(count / total) * 100} style={[styles.fallbackFill, { backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={[styles.ticks, style]} testID={testID}>
      {Array.from({ length: total }, (_, index) => (
        <View key={index} style={styles.tickBase} testID={testID ? `${testID}-tick` : undefined}>
          {index < count ? (
            <Animated.View
              style={[styles.tickFill, { backgroundColor: color, shadowColor: color }, {
                opacity: progress.interpolate({ inputRange: [index, index + 1], outputRange: [0, 1], extrapolate: "clamp" }),
              }]}
            >
              <View style={styles.tickLight} />
            </Animated.View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ticks: { flex: 1, minWidth: 0, flexDirection: "row", gap: 2, height: 7 },
  tickBase: { flex: 1, height: 7, borderRadius: 2, overflow: "hidden", backgroundColor: installerTheme.border, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.45)" },
  tickFill: { ...StyleSheet.absoluteFillObject, borderRadius: 2, shadowOpacity: 0.7, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } },
  tickLight: { position: "absolute", top: 0, start: 0, end: 0, height: 2, backgroundColor: "rgba(255,255,255,0.38)" },
  track: { flex: 1, minWidth: 0, height: 5, overflow: "hidden", borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.border },
  fallbackFill: { height: "100%", borderRadius: installerTheme.radius.pill },
});
