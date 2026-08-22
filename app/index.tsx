import React from "react";
import { View } from "react-native";
import { installerTheme } from "@/lib/theme";

export default function IndexScreen() {
  return <View style={{ flex: 1, backgroundColor: installerTheme.background }} />;
}
