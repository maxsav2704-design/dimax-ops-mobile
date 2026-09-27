import React, { useState } from "react";
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
import type { InstallerEarningsViewModel } from "../src/modules/earnings/types";
import EarningsScreen from "../app/earnings";
import { PreviewLocaleProvider, usePreviewDestination } from "./project-fixtures";
import { setEarningsPreviewSource } from "./earnings-fixtures";

function EarningsPreview() {
  const [locale, setLocale] = useState("ru");
  const [source, setSource] = useState<InstallerEarningsViewModel["source"]>("online");
  const path = usePreviewDestination();
  const [fontsLoaded, fontError] = useFonts({ ...Ionicons.font, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Sora_700Bold, Sora_800ExtraBold, JetBrainsMono_500Medium });
  if (!fontsLoaded && !fontError) return <BrandText>Loading fonts</BrandText>;
  return <SafeAreaProvider><MotionProvider><PreviewLocaleProvider value={locale}>
    <View style={{ maxWidth: 480, width: "100%", alignSelf: "center", flex: 1, direction: locale === "he" ? "rtl" : "ltr" }}>
      <View style={{ padding: 10, gap: 6 }}>
        <BrandText style={{ color: theme.warning, fontSize: 11 }}>EARNINGS / TEST DATA / NO API</BrandText>
        <SegmentedControl value={locale} onChange={setLocale} options={[{ value: "en", label: "EN" }, { value: "ru", label: "RU" }, { value: "he", label: "HE" }]} />
        <SegmentedControl value={source} onChange={(value) => { setEarningsPreviewSource(value as typeof source); setSource(value as typeof source); }} options={[{ value: "online", label: "Online" }, { value: "cache", label: "Cached" }, { value: "unavailable", label: "No data" }]} />
        {path ? <BrandText accessibilityLiveRegion="polite" style={{ color: theme.textMuted, fontSize: 11 }}>TEST DESTINATION: {path}</BrandText> : null}
      </View>
      <EarningsScreen key={`${locale}:${source}`} />
    </View>
  </PreviewLocaleProvider></MotionProvider></SafeAreaProvider>;
}
createRoot(document.getElementById("root")!).render(<EarningsPreview />);
