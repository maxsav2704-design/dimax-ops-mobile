import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
            accessibilityState={{ selected: active }}
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  option: {
    minWidth: 36,
    minHeight: 28,
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
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "800",
  },
  labelDark: {
    color: installerTheme.textFaint,
  },
  labelActive: {
    color: installerTheme.text,
  },
});
