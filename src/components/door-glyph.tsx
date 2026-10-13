import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { installerTheme } from "@/lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type DoorGlyphTone = { background: string; border: string; text: string };

const BASE_WIDTH = 54;

/** A door elevation drawn from views, tinted by work status; replaces decorative photos. */
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
  const beacon = Math.round(17 * k);
  return (
    <View
      testID={testID}
      style={[
        styles.leaf,
        { width, height: Math.round(68 * k), padding: 4 * k, backgroundColor: tone.background, borderColor: tone.text, shadowColor: tone.text },
        style,
      ]}
    >
      <View style={[styles.inset, { borderColor: tone.border }]} />
      <View style={[styles.hinge, { start: 3 * k, top: 16 * k, height: 7 * k }]} />
      <View style={[styles.hinge, { start: 3 * k, bottom: 12 * k, height: 7 * k }]} />
      {icon && !hasIssue ? (
        <View style={[styles.beacon, { top: 4 * k, start: 4 * k, width: beacon, height: beacon, backgroundColor: tone.text }]}>
          <Ionicons name={icon} size={Math.round(10 * k)} color={installerTheme.textOnDark} />
        </View>
      ) : null}
      <View style={[styles.handle, { end: 7 * k, top: 34 * k, width: 4 * k, height: 4 * k, backgroundColor: hasIssue ? installerTheme.dangerFill : handleColor }]} />
      <View style={[styles.threshold, { start: 3 * k, end: 3 * k, bottom: 3 * k }]} />
      {hasIssue ? (
        <View testID={testID ? `${testID}-issue` : undefined} style={[styles.issueFlag, { width: 18 * k, height: 18 * k }]}>
          <Ionicons name="alert" size={Math.round(8 * k)} color={installerTheme.textOnDark} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  leaf: {
    position: "relative",
    borderRadius: 4,
    borderWidth: 2,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  inset: { flex: 1, borderRadius: 2, borderWidth: 1, backgroundColor: installerTheme.shellOverlayFaint },
  hinge: { position: "absolute", width: 2, borderRadius: 1, backgroundColor: installerTheme.textFaint },
  beacon: { position: "absolute", alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill },
  handle: { position: "absolute", borderRadius: installerTheme.radius.pill },
  threshold: { position: "absolute", height: 2, backgroundColor: installerTheme.shellBorder },
  issueFlag: {
    position: "absolute", top: -6, end: -6, alignItems: "center", justifyContent: "center",
    borderRadius: installerTheme.radius.pill, borderWidth: 2, borderColor: installerTheme.card, backgroundColor: installerTheme.dangerFill,
  },
});
