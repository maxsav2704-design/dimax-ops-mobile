import { Stack } from "expo-router";
import React from "react";
import { installerTheme } from "@/lib/theme";
import { AppProviders } from "@/providers/AppProviders";

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: installerTheme.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="projects" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="issues" />
        <Stack.Screen name="earnings" />
        <Stack.Screen name="sync-queue" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="project/[id]" />
      </Stack>
    </AppProviders>
  );
}
