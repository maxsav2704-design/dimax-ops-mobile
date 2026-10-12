import React from "react";
import { StyleSheet } from "react-native";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { BrandText as Text } from "@/components/mobile-ui";
import { installerTheme } from "@/lib/theme";

export function FilterChip({ active, label, onPress, disabled = false }: { active: boolean; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export const chipStyles = StyleSheet.create({
  chip: {
    maxWidth: 240,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.shellRaised,
    paddingHorizontal: 12,
  },
  chipActive: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.primarySoft },
  chipText: { color: installerTheme.textMuted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: installerTheme.info },
});
const styles = chipStyles;
