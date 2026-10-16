import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { Sora_800ExtraBold } from "@expo-google-fonts/sora/800ExtraBold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BrandText, SegmentedControl } from "../src/components/mobile-ui";
import { MotionProvider } from "../src/components/motion";
import { installerTheme as theme } from "../src/lib/theme";
import ProjectsScreen from "../app/projects";
import { PreviewLocaleProvider, usePreviewDestination } from "./project-fixtures";
import { setHomePreviewMode, type HomePreviewMode } from "./home-fixtures";
import { setCalendarPreviewSource } from "./calendar-fixtures";

function HomePreview() {
  const [locale, setLocale] = useState("ru");
  const [mode, setMode] = useState<HomePreviewMode>("online");
  const destination = usePreviewDestination();
  useEffect(() => {
    const change = (event: Event) => setLocale((event as CustomEvent<string>).detail);
    window.addEventListener("preview-locale", change);
    return () => window.removeEventListener("preview-locale", change);
  }, []);
  const [fontsLoaded, fontError] = useFonts({ ...Ionicons.font, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Sora_700Bold, Sora_800ExtraBold, JetBrainsMono_500Medium });
  if (!fontsLoaded && !fontError) return <BrandText>Loading fonts</BrandText>;
  return <SafeAreaProvider><MotionProvider><PreviewLocaleProvider value={locale}>
    <View style={{ maxWidth: 480, width: "100%", flex: 1, alignSelf: "center", direction: locale === "he" ? "rtl" : "ltr" }}>
      <View style={{ padding: 10, gap: 6 }}>
        <BrandText style={{ color: theme.warning, fontSize: 11 }}>HOME / TEST DATA / NO API</BrandText>
        <SegmentedControl value={mode} onChange={(value) => {
          setHomePreviewMode(value);
          setCalendarPreviewSource(value === "cache" || value === "unavailable" ? value : "online");
          setMode(value);
          window.location.hash = "";
        }} options={[{ value: "online", label: "Online" }, { value: "cache", label: "Cached" }, { value: "unavailable", label: "No data" }, { value: "empty", label: "Empty" }]} />
        {destination ? <BrandText style={{ color: theme.textMuted, fontSize: 11 }}>TEST DESTINATION: {destination}</BrandText> : null}
      </View>
      <ProjectsScreen key={mode} />
    </View>
  </PreviewLocaleProvider></MotionProvider></SafeAreaProvider>;
}
createRoot(document.getElementById("root")!).render(<HomePreview />);
