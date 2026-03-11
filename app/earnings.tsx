import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";

export default function EarningsScreen() {
  const [state, setState] = useState<InstallerEarningsViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      setState(await loadInstallerEarnings());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const snapshot = state.snapshot;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={titleStyle}>Installer Earnings</Text>
          <Text style={bodyStyle}>
            Read-only earnings visibility for the installer. Money logic stays on the backend.
          </Text>
        </View>

        <View style={summaryGridStyle}>
          <View style={summaryCardStyle}>
            <Text style={eyebrowStyle}>Today</Text>
            <Text style={valueStyle}>{snapshot?.today_total || "--"}</Text>
          </View>
          <View style={summaryCardStyle}>
            <Text style={eyebrowStyle}>This month</Text>
            <Text style={valueStyle}>{snapshot?.month_total || "--"}</Text>
          </View>
        </View>

        <View style={cardStyle}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={sectionTitle}>Status</Text>
            <Pressable onPress={reload} style={secondaryButton}>
              <Text style={secondaryButtonText}>{loading ? "Loading..." : "Refresh"}</Text>
            </Pressable>
          </View>
          <Text style={bodyStyle}>Source: {state.source}</Text>
          {state.message ? <Text style={[bodyStyle, state.source === "unavailable" && errorStyle]}>{state.message}</Text> : null}
          {snapshot ? (
            <>
              <Text style={sectionTitleSpacer}>By install type</Text>
              {snapshot.install_types.length ? (
                snapshot.install_types.map((item) => (
                  <View key={item.code} style={rowCardStyle}>
                    <Text style={rowTitleStyle}>{item.label}</Text>
                    <Text style={bodyStyle}>Amount: {item.amount}</Text>
                    <Text style={bodyStyle}>Qty: {item.quantity}</Text>
                  </View>
                ))
              ) : (
                <Text style={bodyStyle}>No install type breakdown yet.</Text>
              )}

              <Text style={sectionTitleSpacer}>Daily breakdown</Text>
              {snapshot.days.length ? (
                snapshot.days.map((item) => (
                  <View key={item.date} style={rowCardStyle}>
                    <Text style={rowTitleStyle}>{item.date}</Text>
                    <Text style={bodyStyle}>Amount: {item.amount}</Text>
                    <Text style={bodyStyle}>Jobs: {item.jobs_count}</Text>
                  </View>
                ))
              ) : (
                <Text style={bodyStyle}>No daily breakdown rows yet.</Text>
              )}
            </>
          ) : (
            <Text style={bodyStyle}>
              Earnings view is ready, but it will show real money data after the backend summary contract is connected.
            </Text>
          )}
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

const rowCardStyle = {
  backgroundColor: "#0d2034",
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "#183653",
  padding: 14,
  marginTop: 10,
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

const sectionTitleSpacer = {
  color: "#f8fbff",
  fontSize: 18,
  fontWeight: "700",
  marginTop: 18,
} as const;

const rowTitleStyle = {
  color: "#f8fbff",
  fontSize: 15,
  fontWeight: "700",
} as const;

const secondaryButton = {
  backgroundColor: "#0c1d30",
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#17314f",
  minHeight: 40,
  minWidth: 92,
  paddingHorizontal: 14,
  alignItems: "center",
  justifyContent: "center",
} as const;

const secondaryButtonText = {
  color: "#f8fbff",
  fontWeight: "600",
} as const;

const errorStyle = {
  color: "#ffb86b",
} as const;
