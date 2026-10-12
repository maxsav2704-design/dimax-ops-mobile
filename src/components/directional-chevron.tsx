import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import type { StyleProp, TextStyle } from "react-native";
import { useI18n } from "@/providers/AppProviders";

export type ChevronDirection = "forward" | "back";

/** Icon name for a chevron that points along the reading direction. */
export function chevronIcon(isRTL: boolean, direction: ChevronDirection = "forward"): "chevron-forward" | "chevron-back" {
  const forward = direction === "forward";
  return forward !== isRTL ? "chevron-forward" : "chevron-back";
}

/** A chevron that follows the active locale's reading direction. */
export function DirectionalChevron({ direction = "forward", size = 16, color, style }: {
  direction?: ChevronDirection;
  size?: number;
  color: string;
  style?: StyleProp<TextStyle>;
}) {
  const { isRTL } = useI18n();
  return <Ionicons name={chevronIcon(isRTL, direction)} size={size} color={color} style={style} />;
}
