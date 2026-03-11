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
import { useI18n } from "@/providers/AppProviders";

export default function EarningsScreen() {
  const { t, isRTL } = useI18n();
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
  const [selectedInstallType, setSelectedInstallType] = useState<string>("ALL");

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
  const filteredRows = useMemo(() => {
    const rows = focusContext?.rows || [];
    if (selectedInstallType === "ALL") {
      return rows;
    }
    return rows.filter((item) => item.install_type_code === selectedInstallType);
  }, [focusContext?.rows, selectedInstallType]);
  const installTypeLanes = useMemo(
    () => focusContext?.installTypeSummary || [],
    [focusContext?.installTypeSummary]
  );
  const projectLanes = useMemo(() => {
    const lanes = new Map<
      string,
      {
        key: string;
        projectId: string | null;
        projectName: string;
        amount: number;
        rows: number;
      }
    >();
    for (const row of filteredRows) {
      const key = row.project_id || `unlinked:${row.id}`;
      const current = lanes.get(key) || {
        key,
        projectId: row.project_id,
        projectName: row.project_name || "No project",
        amount: 0,
        rows: 0,
      };
      current.amount += Number.parseFloat(row.amount) || 0;
      current.rows += 1;
      lanes.set(key, current);
    }
    return Array.from(lanes.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);
  const dayLanes = useMemo(() => {
    const lanes = new Map<
      string,
      {
        date: string;
        amount: number;
        rows: number;
        projectLinkedRows: number;
      }
    >();
    for (const row of filteredRows) {
      const current = lanes.get(row.work_date) || {
        date: row.work_date,
        amount: 0,
        rows: 0,
        projectLinkedRows: 0,
      };
      current.amount += Number.parseFloat(row.amount) || 0;
      current.rows += 1;
      if (row.project_id) {
        current.projectLinkedRows += 1;
      }
      lanes.set(row.work_date, current);
    }
    return Array.from(lanes.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredRows]);

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
    if (selectedInstallType === "ALL") {
      return;
    }
    if (!installTypeLanes.some((item) => item.code === selectedInstallType)) {
      setSelectedInstallType("ALL");
    }
  }, [installTypeLanes, selectedInstallType]);

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
          <Text style={[titleStyle, { textAlign: isRTL ? "right" : "left" }]}>{t("earnings.title")}</Text>
          <Text style={[bodyStyle, { textAlign: isRTL ? "right" : "left" }]}>{t("earnings.subtitle")}</Text>
        </View>

        <View style={summaryGridStyle}>
          <View style={summaryCardStyle}>
            <Text style={eyebrowStyle}>{t("common.today")}</Text>
            <Text style={valueStyle}>{snapshot?.today_total || "--"}</Text>
          </View>
          <View style={summaryCardStyle}>
            <Text style={eyebrowStyle}>{t("earnings.thisMonth")}</Text>
            <Text style={valueStyle}>{snapshot?.month_total || "--"}</Text>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("earnings.periodFocus")}</Text>
          <View style={chipRowStyle}>
            {([
              ["TODAY", t("common.today")],
              ["MONTH", t("earnings.thisMonth")],
              ["DAY", t("earnings.selectedDay")],
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
              <Text style={sectionTitleSpacer}>{t("earnings.dayDrilldown")}</Text>
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
              <Text style={bodyStyle}>{t("earnings.focusedTotal")}</Text>
              <Text style={inlineValueStyle}>
                {focusContext ? `${focusContext.total} ${focusContext.currency}` : "--"}
              </Text>
            </View>
            <View style={summaryInlineRowStyle}>
              <Text style={bodyStyle}>{t("earnings.rowsInFocus")}</Text>
              <Text style={inlineValueStyle}>{focusContext?.rows.length ?? "--"}</Text>
            </View>
            {focus === "DAY" ? (
              <View style={summaryInlineRowStyle}>
                <Text style={bodyStyle}>{t("calendar.focusedDay")}</Text>
                <Text style={inlineValueStyle}>{focusContext?.selectedDay || "--"}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
            <Pressable
              onPress={() =>
                router.push(
                  focusContext?.selectedDay
                    ? (`/calendar?day=${encodeURIComponent(focusContext.selectedDay)}` as never)
                    : ("/calendar" as never)
                )
              }
              style={[secondaryButton, { flex: 1 }]}
            >
              <Text style={secondaryButtonText}>
                {focusContext?.selectedDay ? t("earnings.openFocusedDayInCalendar") : t("earnings.openCalendar")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={cardStyle}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={sectionTitle}>{t("common.status")}</Text>
            <Pressable onPress={reload} style={secondaryButton}>
              <Text style={secondaryButtonText}>{loading ? t("common.loading") : t("common.refresh")}</Text>
            </Pressable>
          </View>
          <Text style={bodyStyle}>{t("common.source")}: {state.source}</Text>
          {state.message ? <Text style={[bodyStyle, state.source === "unavailable" && errorStyle]}>{state.message}</Text> : null}
          {snapshot ? (
            <>
              <Text style={sectionTitleSpacer}>{t("earnings.byInstallType")}</Text>
              {installTypeLanes.length ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chipRowStyle}>
                    <Pressable
                      onPress={() => setSelectedInstallType("ALL")}
                      style={[chipStyle, selectedInstallType === "ALL" && chipStyleActive]}
                    >
                      <Text style={{ color: selectedInstallType === "ALL" ? "#04111f" : "#d9e7f7", fontWeight: "600" }}>
                        {t("earnings.allTypes")}
                      </Text>
                    </Pressable>
                    {installTypeLanes.map((item) => (
                      <Pressable
                        key={item.code}
                        onPress={() => setSelectedInstallType(item.code)}
                        style={[chipStyle, selectedInstallType === item.code && chipStyleActive]}
                      >
                        <Text
                          style={{
                            color: selectedInstallType === item.code ? "#04111f" : "#d9e7f7",
                            fontWeight: "600",
                          }}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {installTypeLanes.map((item) => (
                    <Pressable
                      key={item.code}
                      style={[
                        rowCardStyle,
                        selectedInstallType === item.code && { borderColor: "#5aa8ff", backgroundColor: "#11283f" },
                      ]}
                      onPress={() => setSelectedInstallType(item.code)}
                    >
                      <Text style={rowTitleStyle}>{item.label}</Text>
                      <Text style={bodyStyle}>{t("common.amount")}: {item.amount.toFixed(2)} {focusContext?.currency || ""}</Text>
                      <Text style={bodyStyle}>{t("common.quantity")}: {item.quantity}</Text>
                    </Pressable>
                  ))}
                </>
              ) : (
                <Text style={bodyStyle}>{t("earnings.noInstallTypeBreakdown")}</Text>
              )}

              <Text style={sectionTitleSpacer}>{t("earnings.dailyBreakdown")}</Text>
              {snapshot.days.length ? (
                snapshot.days.map((item) => (
                  <View key={item.date} style={rowCardStyle}>
                    <Text style={rowTitleStyle}>{item.date}</Text>
                    <Text style={bodyStyle}>{t("common.amount")}: {item.amount}</Text>
                    <Text style={bodyStyle}>{t("earnings.jobs")}: {item.jobs_count}</Text>
                  </View>
                ))
              ) : (
                <Text style={bodyStyle}>{t("earnings.noDailyBreakdown")}</Text>
              )}

              <Text style={sectionTitleSpacer}>{t("earnings.dayLanes")}</Text>
              {dayLanes.length ? (
                dayLanes.map((lane) => (
                  <View key={lane.date} style={rowCardStyle}>
                    <Text style={rowTitleStyle}>{lane.date}</Text>
                    <Text style={bodyStyle}>{t("common.amount")}: {lane.amount.toFixed(2)} {focusContext?.currency || ""}</Text>
                    <Text style={bodyStyle}>{t("common.rows")}: {lane.rows}</Text>
                    <Text style={bodyStyle}>{t("earnings.projectLinkedRows")}: {lane.projectLinkedRows}</Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      <Pressable
                        onPress={() => router.push(`/calendar?day=${encodeURIComponent(lane.date)}` as never)}
                        style={[secondaryButton, { flex: 1 }]}
                      >
                        <Text style={secondaryButtonText}>{t("earnings.openFocusedDayInCalendar")}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setFocus("DAY");
                          setSelectedDay(lane.date);
                        }}
                        style={[secondaryButton, { flex: 1 }]}
                      >
                        <Text style={secondaryButtonText}>{t("earnings.focusThisDay")}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={bodyStyle}>{t("earnings.noDayLanes")}</Text>
              )}

              <Text style={sectionTitleSpacer}>{t("earnings.projectLanes")}</Text>
              {projectLanes.length ? (
                projectLanes.map((lane) => {
                  const projectId = lane.projectId;
                  return (
                  <View key={lane.key} style={rowCardStyle}>
                    <Text style={rowTitleStyle}>{lane.projectName}</Text>
                    <Text style={bodyStyle}>{t("common.amount")}: {lane.amount.toFixed(2)} {focusContext?.currency || ""}</Text>
                    <Text style={bodyStyle}>{t("common.rows")}: {lane.rows}</Text>
                    {projectId ? (
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                        <Pressable
                          onPress={() => router.push(buildProjectRoute(projectId) as never)}
                          style={[secondaryButton, { flex: 1 }]}
                        >
                          <Text style={secondaryButtonText}>{t("earnings.openProjectLane")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => router.push(buildIssueProjectRoute(projectId, { doorSearch: lane.projectName }) as never)}
                          style={[secondaryButton, { flex: 1 }]}
                        >
                          <Text style={secondaryButtonText}>{t("earnings.issueContext")}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                )})
              ) : (
                <Text style={bodyStyle}>{t("earnings.noProjectLanes")}</Text>
              )}

              <Text style={sectionTitleSpacer}>{t("earnings.workRows")}</Text>
              {filteredRows.length ? (
                filteredRows.slice(0, 12).map((item) => {
                  const projectId = item.project_id;
                  return (
                  <View key={item.id} style={rowCardStyle}>
                    <Text style={rowTitleStyle}>{item.project_name || t("common.noProject")}</Text>
                    <Text style={bodyStyle}>{t("common.date")}: {item.work_date}</Text>
                    <Text style={bodyStyle}>{t("earnings.door")}: {item.door_label || "-"}</Text>
                    <Text style={bodyStyle}>{t("common.type")}: {item.install_type_label}</Text>
                    <Text style={bodyStyle}>{t("common.quantity")}: {item.quantity}</Text>
                    <Text style={bodyStyle}>{t("common.amount")}: {item.amount} {focusContext?.currency || ""}</Text>
                    {projectId ? (
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                        <Pressable
                          onPress={() => router.push(buildProjectRoute(projectId) as never)}
                          style={[secondaryButton, { flex: 1 }]}
                        >
                          <Text style={secondaryButtonText}>{t("earnings.openProject")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            router.push(
                              buildIssueProjectRoute(projectId, {
                                doorSearch: item.door_label || item.project_name || undefined,
                              }) as never
                            )
                          }
                          style={[secondaryButton, { flex: 1 }]}
                        >
                          <Text style={secondaryButtonText}>{t("earnings.issueContext")}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                )})
              ) : (
                <Text style={bodyStyle}>{t("earnings.noRows")}</Text>
              )}
            </>
          ) : (
            <Text style={bodyStyle}>
              {t("earnings.routeReady")}
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
