import React from "react";
import { Pressable, Text, View } from "react-native";
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
            borderColor: value === locale ? "#5aa8ff" : "#17314f",
            backgroundColor: value === locale ? "#5aa8ff" : "#0c1d30",
          }}
        >
          <Text style={{ color: value === locale ? "#04111f" : "#f8fbff", fontWeight: "700" }}>
            {t(`locale.${value}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
