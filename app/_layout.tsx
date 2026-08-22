import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { Sora_600SemiBold } from "@expo-google-fonts/sora/600SemiBold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { Sora_800ExtraBold } from "@expo-google-fonts/sora/800ExtraBold";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { isFontBootstrapReady } from "@/lib/startup";
import { installerTheme } from "@/lib/theme";
import { resolveAuthRedirect } from "@/modules/auth/navigation";
import { AppProviders, useAuth } from "@/providers/AppProviders";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
const FONT_LOAD_TIMEOUT_MS = 8000;

function AppStack() {
  const { loading, user } = useAuth();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const segments = useSegments();
  const firstRouteSegment = segments[0];

  useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }
    const redirect = resolveAuthRedirect(
      Boolean(user),
      firstRouteSegment,
      loading,
    );
    if (redirect) {
      router.replace(redirect);
    }
  }, [firstRouteSegment, loading, rootNavigationState?.key, router, user]);

  return (
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
      <Stack.Screen name="journal" />
      <Stack.Screen name="journal/[id]" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="sync-queue" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="project/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const fontBootstrapReady = isFontBootstrapReady(
    fontsLoaded,
    fontError,
    fontLoadTimedOut,
  );

  useEffect(() => {
    if (fontsLoaded || fontError) {
      return;
    }
    const timeoutId = setTimeout(
      () => setFontLoadTimedOut(true),
      FONT_LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    if (fontBootstrapReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontBootstrapReady]);

  if (!fontBootstrapReady) {
    return null;
  }

  return (
    <AppProviders>
      <AppStack />
    </AppProviders>
  );
}
