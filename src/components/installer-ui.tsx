import { router, usePathname } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "@/providers/AppProviders";

export const installerTheme = {
  background: "#F3F7FB",
  card: "#FFFFFF",
  cardMuted: "#F8FBFF",
  border: "#D8E3EE",
  primary: "#2563EB",
  primarySoft: "#E8F0FF",
  text: "#0F172A",
  textMuted: "#64748B",
  success: "#15803D",
  successSoft: "#EAF8EF",
  warning: "#B45309",
  warningSoft: "#FFF4E5",
  danger: "#C62828",
  dangerSoft: "#FDECEC",
} as const;

export function InstallerBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  const tabs = [
    { href: "/projects", label: t("workspace.title") },
    { href: "/calendar", label: t("title.calendar") },
    { href: "/earnings", label: t("title.earnings") },
    { href: "/sync-queue", label: t("title.syncQueue") },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 18,
        borderTopWidth: 1,
        borderTopColor: installerTheme.border,
        backgroundColor: "#FFFFFFF2",
      }}
    >
      {tabs.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href === "/projects" && pathname.startsWith("/project/"));

        return (
          <Pressable
            key={tab.href}
            onPress={() => router.push(tab.href as never)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 8,
              backgroundColor: active ? installerTheme.primarySoft : installerTheme.card,
              borderWidth: 1,
              borderColor: active ? "#BDD0FF" : installerTheme.border,
            }}
          >
            <Text
              style={{
                color: active ? installerTheme.primary : installerTheme.textMuted,
                fontSize: 12,
                fontWeight: active ? "700" : "600",
                textAlign: "center",
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
