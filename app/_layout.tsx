import { Stack } from "expo-router";
import React from "react";
import { installerTheme } from "@/components/installer-ui";
import { AppProviders, useI18n } from "@/providers/AppProviders";

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

function RootNavigator() {
  const { t } = useI18n();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: installerTheme.card },
        headerTintColor: installerTheme.text,
        headerTitleStyle: { color: installerTheme.text, fontWeight: "700" },
        contentStyle: { backgroundColor: installerTheme.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: t("title.login") }} />
      <Stack.Screen name="projects" options={{ title: t("title.projects") }} />
      <Stack.Screen name="calendar" options={{ title: t("title.calendar") }} />
      <Stack.Screen name="earnings" options={{ title: t("title.earnings") }} />
      <Stack.Screen name="sync-queue" options={{ title: t("title.syncQueue") }} />
      <Stack.Screen name="project/[id]" options={{ title: t("title.project") }} />
    </Stack>
  );
}
