import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { installerTheme } from "@/lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type DoorGlyphTone = { background: string; border: string; text: string };

const BASE_WIDTH = 54;
const EXTRUSION = 3;

/** A door drawn from views with an extruded side, a glossy leaf and a bevelled frame; status-tinted. */
export function DoorGlyph({
  width = BASE_WIDTH,
  tone,
  handleColor = installerTheme.accent,
  hasIssue = false,
  icon,
  style,
  testID,
}: {
  width?: number;
  tone: DoorGlyphTone;
  handleColor?: string;
  hasIssue?: boolean;
  icon?: IconName;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}) {
  const k = width / BASE_WIDTH;
  const height = Math.round(68 * k);
  const depth = EXTRUSION * k;
  const beacon = Math.round(17 * k);
  return (
    <View testID={testID} style={[styles.root, { width: width + depth, height: height + depth }, style]}>
      <View
        testID={testID ? `${testID}-edge` : undefined}
        style={[styles.edge, { width, height, top: depth, start: depth, borderColor: tone.text }]}
      />
      <View style={[styles.leaf, { width, height, padding: 4 * k, backgroundColor: tone.background, borderColor: tone.text, shadowColor: tone.text }]}>
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0.04)", "rgba(0,0,0,0.28)"]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.gloss}
        />
        <View style={[styles.inset, { borderColor: tone.border }]} />
        <View style={[styles.hinge, { start: 3 * k, top: 16 * k, height: 7 * k }]} />
        <View style={[styles.hinge, { start: 3 * k, bottom: 12 * k, height: 7 * k }]} />
        {icon && !hasIssue ? (
          <View style={[styles.beacon, { top: 4 * k, start: 4 * k, width: beacon, height: beacon, backgroundColor: tone.text }]}>
            <Ionicons name={icon} size={Math.round(10 * k)} color={installerTheme.textOnDark} />
          </View>
        ) : null}
        <View style={[styles.handle, { end: 7 * k, top: 34 * k, width: 4 * k, height: 4 * k, backgroundColor: hasIssue ? installerTheme.dangerFill : handleColor }]}>
          <View style={styles.handleGlint} />
        </View>
        <View style={[styles.threshold, { start: 3 * k, end: 3 * k, bottom: 3 * k }]} />
        {hasIssue ? (
          <View testID={testID ? `${testID}-issue` : undefined} style={[styles.issueFlag, { width: 18 * k, height: 18 * k }]}>
            <Ionicons name="alert" size={Math.round(8 * k)} color={installerTheme.textOnDark} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "relative" },
  // The extruded side: same outline, shifted back and down, darker and borderless on the lit side.
  edge: {
    position: "absolute",
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: "rgba(0,0,0,0.55)",
    opacity: 0.7,
  },
  leaf: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 4,
    borderWidth: 2,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  gloss: { ...StyleSheet.absoluteFillObject },
  inset: { flex: 1, borderRadius: 2, borderWidth: 1, backgroundColor: installerTheme.shellOverlayFaint },
  hinge: { position: "absolute", width: 2, borderRadius: 1, backgroundColor: installerTheme.textFaint },
  beacon: { position: "absolute", alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill },
  handle: { position: "absolute", borderRadius: installerTheme.radius.pill, overflow: "hidden" },
  handleGlint: { position: "absolute", top: 0, start: 0, width: "60%", height: "45%", backgroundColor: "rgba(255,255,255,0.45)", borderRadius: installerTheme.radius.pill },
  threshold: { position: "absolute", height: 2, backgroundColor: installerTheme.shellBorder },
  issueFlag: {
    position: "absolute", top: 2, end: 2, alignItems: "center", justifyContent: "center",
    borderRadius: installerTheme.radius.pill, borderWidth: 2, borderColor: installerTheme.card, backgroundColor: installerTheme.dangerFill,
  },
});
