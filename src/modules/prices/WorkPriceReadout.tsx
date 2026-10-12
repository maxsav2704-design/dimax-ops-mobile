import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ActionButton, BrandText as Text } from "@/components/mobile-ui";
import { installerTheme as theme, toneColors } from "@/lib/theme";
import type { WorkPricePresentation } from "./presentation";

export function WorkPriceReadout({ price, onOpen, busy = false, testID }: {
  price: WorkPricePresentation;
  onOpen?: () => void;
  busy?: boolean;
  testID: string;
}) {
  const color = toneColors(price.tone).text;
  return <View style={styles.band} testID={testID}>
    <View style={styles.heading}>
      <Ionicons name={price.value ? "shield-checkmark-outline" : "information-circle-outline"} size={19} color={color} />
      <Text style={styles.title}>{price.title}</Text>
    </View>
    {price.value ? <Text selectable style={[styles.amount, { color }]}>{price.value}</Text> : null}
    {price.meta ? <Text style={styles.meta}>{price.meta}</Text> : null}
    {price.estimate ? <View style={styles.estimate}>
      <Text style={styles.estimateLabel}>{price.estimate.label}</Text>
      <Text style={styles.estimateValue}>{price.estimate.value}</Text>
    </View> : null}
    <Text style={styles.note}>{price.note}</Text>
    {price.link && price.linkLabel && onOpen ? <ActionButton variant="secondary"
      icon={price.link === "queue" ? "cloud-upload-outline" : "wallet-outline"}
      label={price.linkLabel} disabled={busy} onPress={onOpen} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  band: { paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border, gap: 8 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, color: theme.text, fontWeight: "700" },
  amount: { fontSize: 20, lineHeight: 28, fontWeight: "700", writingDirection: "ltr" },
  meta: { fontSize: theme.type.caption, lineHeight: 17, color: theme.textMuted },
  note: { fontSize: 12, lineHeight: 18, color: theme.textMuted },
  estimate: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderColor: theme.border },
  estimateLabel: { fontSize: 12, lineHeight: 18, color: theme.textMuted },
  estimateValue: { fontSize: 18, lineHeight: 26, fontWeight: "700", color: theme.accent, writingDirection: "ltr" },
});
