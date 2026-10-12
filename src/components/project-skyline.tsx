import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { installerTheme } from "@/lib/theme";

export type SkylineBar = { id: string; total: number; installed: number; issues: number };

const MAX_BARS = 12;
const MIN_HEIGHT = 0.18;

/** One bar per project: height follows door count, fill follows installed doors. */
export function buildSkyline(
  projects: ReadonlyArray<{ id: string }>,
  summaries: Record<string, { total: number; remaining: number; issues: number } | undefined>,
): SkylineBar[] {
  return projects.slice(0, MAX_BARS).map((project) => {
    const summary = summaries[project.id];
    const total = Math.max(0, summary?.total ?? 0);
    return {
      id: project.id,
      total,
      installed: Math.min(total, Math.max(0, total - (summary?.remaining ?? total))),
      issues: Math.max(0, summary?.issues ?? 0),
    };
  });
}

export function ProjectSkyline({ bars, height = 96, style, testID }: {
  bars: SkylineBar[];
  height?: number;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}) {
  const maxTotal = Math.max(1, ...bars.map((bar) => bar.total));
  return (
    <View pointerEvents="none" testID={testID} style={[styles.skyline, { height }, style]}>
      {bars.map((bar) => {
        const share = bar.total === 0 ? MIN_HEIGHT : Math.max(MIN_HEIGHT, bar.total / maxTotal);
        const fillShare = bar.total === 0 ? 0 : bar.installed / bar.total;
        const fillColor = bar.issues > 0 ? installerTheme.warning : installerTheme.success;
        return (
          <View key={bar.id} testID={testID ? `${testID}-bar` : undefined} style={[styles.bar, { height: Math.round(height * share) }]}>
            <View style={[styles.fill, { height: `${Math.round(fillShare * 100)}%`, backgroundColor: fillColor }]} />
          </View>
        );
      })}
      <View style={styles.ground} />
    </View>
  );
}

const styles = StyleSheet.create({
  skyline: { flexDirection: "row", alignItems: "flex-end", gap: 5, paddingHorizontal: 6 },
  bar: {
    flex: 1, maxWidth: 26, overflow: "hidden", justifyContent: "flex-end",
    borderTopStartRadius: 3, borderTopEndRadius: 3, borderWidth: 1, borderBottomWidth: 0,
    borderColor: installerTheme.shellBorder, backgroundColor: installerTheme.shellOverlaySubtle,
  },
  fill: { width: "100%", opacity: 0.75 },
  ground: { position: "absolute", start: 0, end: 0, bottom: 0, height: 1, backgroundColor: installerTheme.shellBorder },
});
