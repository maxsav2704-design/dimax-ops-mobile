import Ionicons from "@expo/vector-icons/Ionicons";
import { router, usePathname } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { installerTheme } from "@/lib/theme";
import { useI18n } from "@/providers/AppProviders";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function InstallerBottomNav() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const label = (en: string, ru: string, he: string) => {
    if (locale === "ru") return ru;
    if (locale === "he") return he;
    return en;
  };

  const tabs: Array<{ href: string; label: string; icon: IconName; activeIcon: IconName }> = [
    { href: "/projects", label: label("Jobs", "Работы", "עבודות"), icon: "briefcase-outline", activeIcon: "briefcase" },
    { href: "/calendar", label: label("Plan", "План", "יומן"), icon: "calendar-outline", activeIcon: "calendar" },
    { href: "/issues", label: label("Issues", "Проблемы", "תקלות"), icon: "alert-circle-outline", activeIcon: "alert-circle" },
    { href: "/earnings", label: label("Earnings", "Заработок", "שכר"), icon: "wallet-outline", activeIcon: "wallet" },
    { href: "/profile", label: label("Me", "Профиль", "אני"), icon: "person-outline", activeIcon: "person" },
  ];

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href === "/projects" && pathname.startsWith("/project/"));
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => router.replace(tab.href as never)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <View style={[styles.iconShell, active && styles.iconShellActive]}>
              <Ionicons
                name={active ? tab.activeIcon : tab.icon}
                size={20}
                color={active ? installerTheme.text : installerTheme.textMuted}
              />
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 6,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: installerTheme.border,
    backgroundColor: installerTheme.card,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 3,
  },
  iconShell: {
    minWidth: 40,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
  },
  iconShellActive: {
    backgroundColor: installerTheme.accent,
  },
  label: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    fontWeight: "700",
  },
  labelActive: {
    color: installerTheme.text,
  },
  pressed: {
    opacity: 0.65,
  },
});
