import React from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

/** Points for a polyline scaled into the box; a flat series sits on the baseline. */
export function sparklinePath(points: ReadonlyArray<number>, width: number, height: number, padding = 2): string {
  if (!points.length) return "";
  const peak = Math.max(...points.map(Math.abs), 1);
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const y = (value: number) => height - padding - (Math.max(0, value) / peak) * (height - padding * 2);
  return points.map((value, index) => `${index === 0 ? "M" : "L"}${(padding + index * step).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
}

/** A thin glowing sparkline with a soft area fill and a lit end point. */
export function Sparkline({ points, width = 96, height = 28, color, style, testID }: {
  points: ReadonlyArray<number>;
  width?: number;
  height?: number;
  color: string;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}) {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const line = sparklinePath(points, width, height);
  if (!line) return null;
  const last = line.slice(line.lastIndexOf("L") + 1 || line.lastIndexOf("M") + 1).trim().split(" ").map(Number);
  const area = `${line} L${(width - 2).toFixed(1)} ${height} L2 ${height} Z`;
  return (
    <View style={style} testID={testID}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.35" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={area} fill={`url(#area-${id})`} />
        <Path d={line} stroke={color} strokeOpacity={0.35} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" fill="none" />
        <Path d={line} stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" fill="none" />
        <Circle cx={last[0]} cy={last[1]} r={3.5} fill={color} fillOpacity={0.35} />
        <Circle cx={last[0]} cy={last[1]} r={1.8} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}
