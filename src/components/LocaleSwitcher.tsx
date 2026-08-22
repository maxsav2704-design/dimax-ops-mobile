import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BrandText as Text } from "@/components/mobile-ui";
import { installerTheme } from "@/lib/theme";
import { useI18n } from "@/providers/AppProviders";

export function LocaleSwitcher({ dark = false }: { dark?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <View style={[styles.shell, dark && styles.shellDark]}>
      {(["en", "ru", "he"] as const).map((value) => {
        const active = value === locale;
        return (
          <Pressable
            key={value}
            onPress={() => setLocale(value)}
            style={[styles.option, active && styles.optionActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(`locale.${value}`)}
          >
            <Text style={[styles.label, dark && styles.labelDark, active && styles.labelActive]}>
              {t(`locale.${value}`)}
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
    alignItems: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    padding: 2,
  },
  shellDark: {
    borderColor: installerTheme.shellBorder,
    backgroundColor: installerTheme.shellOverlay,
  },
  option: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    paddingHorizontal: 8,
  },
  optionActive: {
    backgroundColor: installerTheme.accent,
  },
  label: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 10,
  },
  labelDark: {
    color: installerTheme.textFaint,
  },
  labelActive: {
    color: installerTheme.textOnAccent,
  },
});
