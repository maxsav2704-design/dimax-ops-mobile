import React from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

export default function CalendarScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={titleStyle}>Installer Calendar</Text>
          <Text style={bodyStyle}>
            This route is the mobile baseline for the installer schedule flow.
          </Text>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>Planned first slice</Text>
          <Text style={bodyStyle}>- upcoming events</Text>
          <Text style={bodyStyle}>- project context per event</Text>
          <Text style={bodyStyle}>- quick jump to project</Text>
          <Text style={bodyStyle}>- loading / empty / error states</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: "#0a1a2b",
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "#17314f",
  padding: 18,
} as const;

const titleStyle = {
  color: "#f8fbff",
  fontSize: 22,
  fontWeight: "700",
} as const;

const sectionTitle = {
  color: "#f8fbff",
  fontSize: 18,
  fontWeight: "700",
} as const;

const bodyStyle = {
  color: "#8fa7c2",
  marginTop: 6,
} as const;
