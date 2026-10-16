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
import SyncQueueScreen from "../app/sync-queue";
import { PreviewLocaleProvider, usePreviewDestination } from "./project-fixtures";
import { resetQueuePreview, type QueuePreviewMode } from "./sync-queue-fixtures";

function SyncQueuePreview() {
  const [locale, setLocale] = useState("ru");
  const [mode, setMode] = useState<QueuePreviewMode>("mixed");
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
        <BrandText style={{ color: theme.warning, fontSize: 11 }}>SYNC QUEUE / TEST DATA / NO API</BrandText>
        <SegmentedControl value={mode} onChange={(value) => {
          resetQueuePreview(value);
          setMode(value);
          window.location.hash = "";
        }} options={[{ value: "mixed", label: "Mixed" }, { value: "offline", label: "Offline" }, { value: "unavailable", label: "No data" }, { value: "empty", label: "Empty" }]} />
        <SegmentedControl value={locale} onChange={setLocale} options={[{ value: "en", label: "EN" }, { value: "ru", label: "RU" }, { value: "he", label: "HE" }]} />
        {destination ? <BrandText style={{ color: theme.textMuted, fontSize: 11 }}>TEST DESTINATION: {destination}</BrandText> : null}
      </View>
      <SyncQueueScreen key={mode} />
    </View>
  </PreviewLocaleProvider></MotionProvider></SafeAreaProvider>;
}
createRoot(document.getElementById("root")!).render(<SyncQueuePreview />);
