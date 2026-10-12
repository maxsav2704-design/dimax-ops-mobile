import Ionicons from "@expo/vector-icons/Ionicons";
import { router, usePathname } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { BrandText as Text } from "@/components/mobile-ui";
import { installerTheme, toneColors } from "@/lib/theme";
import { buildSyncStatusPresentation } from "@/modules/sync/presentation";
import { useSyncStatus } from "@/modules/sync/use-sync-status";
import { useI18n } from "@/providers/AppProviders";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Persistent sync strip above the bottom navigation; opens the sync queue. */
export function SyncStatusBar() {
  const status = useSyncStatus();
  const { locale } = useI18n();
  const pathname = usePathname();
  if (!status.queue && !status.syncing) return null;
  const view = buildSyncStatusPresentation(status, locale);
  const colors = toneColors(view.tone === "info" ? "info" : view.tone);
  const onQueue = pathname === "/sync-queue";
  const openLabel = locale === "ru" ? "Открыть очередь синхронизации" : locale === "he" ? "פתיחת תור הסנכרון" : "Open sync queue";
  return (
    <Pressable
      testID="sync-status-bar"
      accessibilityRole="button"
      accessibilityLabel={`${openLabel}: ${view.label}`}
      accessibilityLiveRegion="polite"
      disabled={onQueue}
      feedback={onQueue ? "none" : "press"}
      onPress={() => router.push("/sync-queue" as never)}
      style={[styles.bar, { borderColor: colors.border, backgroundColor: colors.background }]}
    >
      <Ionicons name={view.icon as IconName} size={14} color={colors.text} />
      <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>{view.label}</Text>
      {view.detail ? <Text style={styles.detail}>{view.detail}</Text> : null}
      {!onQueue ? <Ionicons name={locale === "he" ? "chevron-back" : "chevron-forward"} size={13} color={installerTheme.textFaint} /> : <View style={styles.spacer} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    maxWidth: "100%",
    minHeight: 30,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: installerTheme.radius.pill,
  },
  label: { flexShrink: 1, fontFamily: installerTheme.fontFamilyStrong, fontSize: installerTheme.type.caption, lineHeight: 16 },
  detail: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption, lineHeight: 16 },
  spacer: { width: 13 },
});
