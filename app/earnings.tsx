import React from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

export default function EarningsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={titleStyle}>Installer Earnings</Text>
          <Text style={bodyStyle}>
            This route is reserved for installer earnings visibility without duplicating money logic on-device.
          </Text>
        </View>

        <View style={summaryGridStyle}>
          <View style={summaryCardStyle}>
            <Text style={eyebrowStyle}>Today</Text>
            <Text style={valueStyle}>--</Text>
          </View>
          <View style={summaryCardStyle}>
            <Text style={eyebrowStyle}>This month</Text>
            <Text style={valueStyle}>--</Text>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>Planned first slice</Text>
          <Text style={bodyStyle}>- today earnings</Text>
          <Text style={bodyStyle}>- monthly total</Text>
          <Text style={bodyStyle}>- daily breakdown</Text>
          <Text style={bodyStyle}>- by install type</Text>
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

const summaryGridStyle = {
  flexDirection: "row",
  gap: 12,
} as const;

const summaryCardStyle = {
  flex: 1,
  backgroundColor: "#0d2034",
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "#183653",
  padding: 16,
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

const eyebrowStyle = {
  color: "#8fa7c2",
  fontSize: 12,
  textTransform: "uppercase",
} as const;

const valueStyle = {
  color: "#f8fbff",
  fontSize: 24,
  fontWeight: "700",
  marginTop: 8,
} as const;

const bodyStyle = {
  color: "#8fa7c2",
  marginTop: 6,
} as const;
