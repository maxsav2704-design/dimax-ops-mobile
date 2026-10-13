import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { installerTheme } from "@/lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type DoorGlyphTone = { background: string; border: string; text: string };

const BASE_WIDTH = 54;
const BASE_HEIGHT = 68;
const GOLD = installerTheme.accent;
const GOLD_LIGHT = "#F3D58A";
const GOLD_DEEP = "#8E6A22";

// Thin line art: a narrow frame on a floor line with the leaf swung ajar towards the viewer.
const FLOOR = "M3 64.5 H51";
const FRAME = "M11 64 V5.5 Q11 4 12.5 4 H41.5 Q43 4 43 5.5 V64";
const FRAME_INNER = "M13.6 64 V6.6 H40.4 V64";
const LEAF = "M15 7 L35 11.5 L35 59.5 L15 62 Z";
const LEAF_PANEL = "M19 15.5 L31 18.3 L31 51.7 L19 54.5 Z";
const HINGES = "M15 18 H17.6 M15 50 H17.6";
const LEAF_EDGE = "M35 11.5 L36.4 12.6 L36.4 58.4 L35 59.5";

/**
 * A door in thin premium line work: gold frame, ajar leaf with an inner panel, hinges and knob.
 * The status tone glows softly behind the frame; the issue flag and beacon sit on top.
 */
export function DoorGlyph({
  width = BASE_WIDTH,
  tone,
  handleColor = GOLD,
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
  const height = Math.round(BASE_HEIGHT * k);
  const beacon = Math.round(17 * k);
  return (
    <View testID={testID} style={[styles.root, { width, height }, style]}>
      <Svg width={width} height={height} viewBox={`0 0 ${BASE_WIDTH} ${BASE_HEIGHT}`}>
        {/* Status glow behind the frame */}
        <Path d={FRAME} stroke={tone.text} strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" fill="none" testID={testID ? `${testID}-halo` : undefined} />
        {/* Depth: a dark offset of the frame */}
        <Path d={FRAME} stroke="#000000" strokeOpacity={0.5} strokeWidth={1.4} fill="none" transform="translate(1.4 1.4)" />
        {/* Floor and frame */}
        <Path d={FLOOR} stroke={GOLD_DEEP} strokeOpacity={0.9} strokeWidth={1.2} strokeLinecap="round" />
        <Path d={FRAME} stroke={GOLD} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d={FRAME_INNER} stroke={GOLD} strokeOpacity={0.45} strokeWidth={0.8} strokeLinejoin="round" fill="none" />
        {/* Leaf swung ajar, with its lit edge and inner panel */}
        <Path d={LEAF} fill={tone.background} fillOpacity={0.9} stroke={GOLD_LIGHT} strokeWidth={1.2} strokeLinejoin="round" />
        <Path d={LEAF_EDGE} stroke={GOLD_DEEP} strokeWidth={1} strokeLinejoin="round" fill="none" />
        <Path d={LEAF_PANEL} stroke={GOLD} strokeOpacity={0.55} strokeWidth={0.7} strokeLinejoin="round" fill="none" />
        <Path d={HINGES} stroke={GOLD_LIGHT} strokeWidth={1.2} strokeLinecap="round" />
        {/* Knob */}
        <Circle cx={31.5} cy={36} r={1.7} fill={hasIssue ? installerTheme.dangerFill : handleColor} />
      </Svg>
      {icon && !hasIssue ? (
        <View style={[styles.beacon, { top: 6 * k, start: 2 * k, width: beacon, height: beacon, backgroundColor: tone.text }]}>
          <Ionicons name={icon} size={Math.round(10 * k)} color={installerTheme.textOnDark} />
        </View>
      ) : null}
      {hasIssue ? (
        <View testID={testID ? `${testID}-issue` : undefined} style={[styles.issueFlag, { width: 18 * k, height: 18 * k }]}>
          <Ionicons name="alert" size={Math.round(8 * k)} color={installerTheme.textOnDark} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "relative" },
  beacon: { position: "absolute", alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill },
  issueFlag: {
    position: "absolute", top: 0, end: 2, alignItems: "center", justifyContent: "center",
    borderRadius: installerTheme.radius.pill, borderWidth: 2, borderColor: installerTheme.card, backgroundColor: installerTheme.dangerFill,
  },
});
