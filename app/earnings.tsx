import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import {
  buildEarningsFocusContext,
  type EarningsPeriodFocus,
} from "@/modules/earnings/presentation";
import { buildIssueProjectRoute, buildProjectRoute } from "@/modules/projects/navigation";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";

export default function EarningsScreen() {
  const params = useLocalSearchParams<{
    focus?: string;
    day?: string;
  }>();
  const [state, setState] = useState<InstallerEarningsViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<EarningsPeriodFocus>("MONTH");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
  const todayDate = new Date().toISOString().slice(0, 10);
  const focusContext = useMemo(
    () => buildEarningsFocusContext(snapshot, todayDate, focus, selectedDay),
    [focus, selectedDay, snapshot, todayDate]
  );

  useEffect(() => {
    if (!snapshot?.days.length) {
      setSelectedDay(null);
      return;
    }
    if (!selectedDay || !snapshot.days.some((item) => item.date === selectedDay)) {
      setSelectedDay(snapshot.days[0].date);
    }
  }, [selectedDay, snapshot]);

  useEffect(() => {
    const incomingFocus = typeof params.focus === "string" ? params.focus.trim().toUpperCase() : "";
    const incomingDay = typeof params.day === "string" ? params.day.trim() : "";
    if (incomingFocus === "TODAY" || incomingFocus === "MONTH" || incomingFocus === "DAY") {
      setFocus(incomingFocus as EarningsPeriodFocus);
    }
    if (incomingDay) {
      setSelectedDay(incomingDay);
    }
  }, [params.day, params.focus]);

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
          <Text style={sectionTitle}>Period focus</Text>
          <View style={chipRowStyle}>
            {([
              ["TODAY", "Today"],
              ["MONTH", "This month"],
              ["DAY", "Selected day"],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setFocus(value)}
                style={[chipStyle, focus === value && chipStyleActive]}
              >
                <Text style={{ color: focus === value ? "#04111f" : "#d9e7f7", fontWeight: "600" }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {snapshot?.days.length ? (
            <>
              <Text style={sectionTitleSpacer}>Day drilldown</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chipRowStyle}>
                {snapshot.days.map((item) => (
                  <Pressable
                    key={item.date}
                    onPress={() => {
                      setFocus("DAY");
                      setSelectedDay(item.date);
                    }}
                    style={[chipStyle, selectedDay === item.date && chipStyleActive]}
                  >
                    <Text style={{ color: selectedDay === item.date ? "#04111f" : "#d9e7f7", fontWeight: "600" }}>
                      {item.date}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
          <View style={{ gap: 10, marginTop: 14 }}>
            <View style={summaryInlineRowStyle}>
              <Text style={bodyStyle}>Focused total</Text>
              <Text style={inlineValueStyle}>
                {focusContext ? `${focusContext.total} ${focusContext.currency}` : "--"}
              </Text>
            </View>
            <View style={summaryInlineRowStyle}>
              <Text style={bodyStyle}>Rows in focus</Text>
              <Text style={inlineValueStyle}>{focusContext?.rows.length ?? "--"}</Text>
            </View>
            {focus === "DAY" ? (
              <View style={summaryInlineRowStyle}>
                <Text style={bodyStyle}>Focused day</Text>
                <Text style={inlineValueStyle}>{focusContext?.selectedDay || "--"}</Text>
              </View>
            ) : null}
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
              {focusContext?.installTypeSummary.length ? (
                focusContext.installTypeSummary.map((item) => (
                  <View key={item.code} style={rowCardStyle}>
                    <Text style={rowTitleStyle}>{item.label}</Text>
                    <Text style={bodyStyle}>Amount: {item.amount.toFixed(2)} {focusContext.currency}</Text>
                    <Text style={bodyStyle}>Qty: {item.quantity}</Text>
                  </View>
                ))
              ) : (
                <Text style={bodyStyle}>No install type breakdown for the current focus.</Text>
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

              <Text style={sectionTitleSpacer}>Work rows in focus</Text>
              {focusContext?.rows.length ? (
                focusContext.rows.slice(0, 12).map((item) => {
                  const projectId = item.project_id;
                  return (
                  <View key={item.id} style={rowCardStyle}>
                    <Text style={rowTitleStyle}>{item.project_name || "No project"}</Text>
                    <Text style={bodyStyle}>Date: {item.work_date}</Text>
                    <Text style={bodyStyle}>Door: {item.door_label || "-"}</Text>
                    <Text style={bodyStyle}>Type: {item.install_type_label}</Text>
                    <Text style={bodyStyle}>Qty: {item.quantity}</Text>
                    <Text style={bodyStyle}>Amount: {item.amount} {focusContext.currency}</Text>
                    {projectId ? (
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                        <Pressable
                          onPress={() => router.push(buildProjectRoute(projectId))}
                          style={[secondaryButton, { flex: 1 }]}
                        >
                          <Text style={secondaryButtonText}>Open project</Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            router.push(
                              buildIssueProjectRoute(projectId, {
                                doorSearch: item.door_label || item.project_name || undefined,
                              })
                            )
                          }
                          style={[secondaryButton, { flex: 1 }]}
                        >
                          <Text style={secondaryButtonText}>Issue context</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                )})
              ) : (
                <Text style={bodyStyle}>No earnings rows in the current focus.</Text>
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

const chipRowStyle = {
  flexDirection: "row",
  gap: 8,
  marginTop: 12,
} as const;

const chipStyle = {
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "#17314f",
  backgroundColor: "#0c1d30",
} as const;

const chipStyleActive = {
  backgroundColor: "#5aa8ff",
  borderColor: "#5aa8ff",
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

const summaryInlineRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const inlineValueStyle = {
  color: "#f8fbff",
  fontWeight: "700",
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
