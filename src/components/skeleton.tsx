import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";
import { BrandText as Text } from "@/components/mobile-ui";
import { useReducedMotion } from "@/components/motion";
import { installerTheme } from "@/lib/theme";

/** One pulsing placeholder block; holds a steady tone with reduced motion. */
export function Skeleton({ width = "100%", height = 12, radius = 6, style }: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reducedMotion) { pulse.setValue(0.55); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
      Animated.timing(pulse, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);
  return <Animated.View style={[styles.block, { width, height, borderRadius: radius, opacity: pulse }, style]} />;
}

export type SkeletonVariant = "rows" | "cards" | "tiles";

/** Placeholder shaped like the content that is loading, announced once to screen readers. */
export function SkeletonList({ variant = "rows", rows = 3, label, testID }: {
  variant?: SkeletonVariant;
  rows?: number;
  label: string;
  testID?: string;
}) {
  const items = Array.from({ length: variant === "tiles" ? 3 : rows }, (_, index) => index);
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={label} testID={testID} style={styles.list}>
      {variant === "tiles" ? (
        <View style={styles.tiles}>
          {items.map((index) => (
            <View key={index} style={styles.tile} testID={testID ? `${testID}-item` : undefined}>
              <Skeleton width="55%" height={10} />
              <Skeleton width="70%" height={18} radius={5} style={styles.gap} />
            </View>
          ))}
        </View>
      ) : items.map((index) => variant === "cards" ? (
        <View key={index} style={styles.card} testID={testID ? `${testID}-item` : undefined}>
          <Skeleton width="48%" height={14} />
          <Skeleton width="72%" height={10} style={styles.gap} />
          <Skeleton height={5} radius={3} style={styles.bar} />
        </View>
      ) : (
        <View key={index} style={styles.row} testID={testID ? `${testID}-item` : undefined}>
          <Skeleton width={34} height={34} radius={17} />
          <View style={styles.rowBody}>
            <Skeleton width="62%" height={12} />
            <Skeleton width="38%" height={10} style={styles.gap} />
          </View>
        </View>
      ))}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: installerTheme.shellOverlay },
  list: { gap: 10, paddingVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  rowBody: { flex: 1, minWidth: 0 },
  card: { padding: 14, borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: installerTheme.border, backgroundColor: installerTheme.cardMuted },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, padding: 12, borderRadius: installerTheme.radius.md, borderWidth: 1, borderColor: installerTheme.border, backgroundColor: installerTheme.cardMuted },
  gap: { marginTop: 8 },
  bar: { marginTop: 12 },
  label: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16, textAlign: "center", marginTop: 2 },
});
