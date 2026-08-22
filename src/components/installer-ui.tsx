import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, usePathname } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandText as Text } from "@/components/mobile-ui";
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

  const tabs: Array<{
    href: string;
    label: string;
    icon: IconName;
    activeIcon: IconName;
    center?: boolean;
  }> = [
    {
      href: "/projects",
      label: label("Jobs", "Работы", "עבודות"),
      icon: "briefcase-outline",
      activeIcon: "briefcase",
    },
    {
      href: "/calendar",
      label: label("Plan", "План", "יומן"),
      icon: "calendar-outline",
      activeIcon: "calendar",
    },
    {
      href: "/journal",
      label: label("Journal", "Журнал", "יומן עבודה"),
      icon: "document-text-outline",
      activeIcon: "document-text",
      center: true,
    },
    {
      href: "/earnings",
      label: label("Earnings", "Заработок", "שכר"),
      icon: "wallet-outline",
      activeIcon: "wallet",
    },
    {
      href: "/profile",
      label: label("Me", "Профиль", "אני"),
      icon: "person-outline",
      activeIcon: "person",
    },
  ];

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.shell}>
        {tabs.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href === "/projects" && pathname.startsWith("/project/")) ||
            (tab.href === "/journal" && pathname.startsWith("/journal/"));
          return (
            <View key={tab.href} style={styles.tabSlot}>
              <Link href={tab.href as never} replace asChild>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tab.label}
                  hitSlop={
                    tab.center
                      ? { top: 36, right: 0, bottom: 0, left: 0 }
                      : undefined
                  }
                  style={({ pressed }) => [
                    styles.tab,
                    tab.center && styles.centerTab,
                    pressed && styles.pressed,
                  ]}
                >
                  {tab.center ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.centerOuter,
                        active && styles.centerOuterActive,
                      ]}
                    >
                      <LinearGradient
                        colors={[
                          "rgba(51,142,255,0.94)",
                          "rgba(51,142,255,0.48)",
                        ]}
                        start={{ x: 0.2, y: 0 }}
                        end={{ x: 0.8, y: 1 }}
                        style={styles.centerIcon}
                      >
                        <Ionicons
                          name={active ? tab.activeIcon : tab.icon}
                          size={25}
                          color={installerTheme.background}
                        />
                      </LinearGradient>
                    </View>
                  ) : (
                    <View pointerEvents="none" style={styles.iconShell}>
                      <Ionicons
                        name={active ? tab.activeIcon : tab.icon}
                        size={20}
                        color={
                          active
                            ? installerTheme.info
                            : installerTheme.textMuted
                        }
                      />
                    </View>
                  )}
                  <View
                    pointerEvents="none"
                    style={tab.center ? styles.centerLabel : undefined}
                  >
                    <Text
                      style={[styles.label, active && styles.labelActive]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </View>
                  {!tab.center ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.activeRail,
                        active && styles.activeRailVisible,
                      ]}
                    />
                  ) : null}
                </Pressable>
              </Link>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 28,
    backgroundColor: "transparent",
  },
  shell: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 66,
    paddingHorizontal: 7,
    paddingTop: 8,
    paddingBottom: 7,
    borderWidth: 1,
    borderColor: installerTheme.border,
    borderRadius: 24,
    backgroundColor: "rgba(8,14,21,0.96)",
    shadowColor: "#000000",
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -7 },
    elevation: 10,
  },
  tabSlot: {
    flex: 1,
    minWidth: 0,
  },
  tab: {
    position: "relative",
    width: "100%",
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
  },
  centerTab: {
    overflow: "visible",
  },
  iconShell: {
    minWidth: 32,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  activeRail: {
    position: "absolute",
    bottom: -2,
    width: 24,
    height: 2,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: "transparent",
  },
  activeRailVisible: {
    backgroundColor: installerTheme.info,
    shadowColor: installerTheme.info,
    shadowOpacity: 0.85,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  label: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 9,
  },
  centerOuter: {
    position: "absolute",
    top: -36,
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 31,
    borderWidth: 1,
    borderColor: installerTheme.infoBorder,
    backgroundColor: installerTheme.background,
    shadowColor: installerTheme.primary,
    shadowOpacity: 0.48,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  centerOuterActive: {
    borderColor: installerTheme.primary,
  },
  centerIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
  },
  centerLabel: {
    marginTop: 27,
  },
  labelActive: {
    color: installerTheme.info,
  },
  pressed: {
    opacity: 0.65,
  },
});
