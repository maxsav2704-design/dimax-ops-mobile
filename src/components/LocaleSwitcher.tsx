import React from "react";
import { Pressable, Text, View } from "react-native";
import { installerTheme } from "@/components/installer-ui";
import { useI18n } from "@/providers/AppProviders";

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {(["en", "ru", "he"] as const).map((value) => (
        <Pressable
          key={value}
          onPress={() => setLocale(value)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: value === locale ? "#BDD0FF" : installerTheme.border,
            backgroundColor: value === locale ? installerTheme.primarySoft : installerTheme.card,
          }}
        >
          <Text style={{ color: value === locale ? installerTheme.primary : installerTheme.textMuted, fontWeight: "700" }}>
            {t(`locale.${value}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
