import { Stack } from "expo-router";
import React from "react";
import { AppProviders } from "@/providers/AppProviders";

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#071523" },
          headerTintColor: "#f8fbff",
          contentStyle: { backgroundColor: "#04111f" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "DIMAX Installer" }} />
        <Stack.Screen name="projects" options={{ title: "My Projects" }} />
        <Stack.Screen name="calendar" options={{ title: "My Calendar" }} />
        <Stack.Screen name="earnings" options={{ title: "My Earnings" }} />
        <Stack.Screen name="sync-queue" options={{ title: "Sync Queue" }} />
        <Stack.Screen name="project/[id]" options={{ title: "Project" }} />
      </Stack>
    </AppProviders>
  );
}
