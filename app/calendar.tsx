import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import type { InstallerCalendarViewModel } from "@/modules/calendar/types";
import {
  buildDoorPrepRoute,
  buildIssueRouteFromCalendarEvent,
  buildProjectRouteFromCalendarEvent,
} from "@/modules/projects/navigation";
import { useI18n } from "@/providers/AppProviders";

export default function CalendarScreen() {
  const { t, isRTL } = useI18n();
  const params = useLocalSearchParams<{
    day?: string;
  }>();
  const [state, setState] = useState<InstallerCalendarViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string>("ALL");

  const reload = async () => {
    setLoading(true);
    try {
      setState(await loadInstallerCalendar("7d"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const snapshot = state.snapshot;
  const dayOptions = useMemo(
    () => Array.from(new Set((snapshot?.items || []).map((item) => item.starts_at.slice(0, 10)))).sort(),
    [snapshot]
  );
  const visibleItems = useMemo(() => {
    const items = snapshot?.items || [];
    if (selectedDay === "ALL") {
      return items;
    }
    return items.filter((item) => item.starts_at.slice(0, 10) === selectedDay);
  }, [selectedDay, snapshot]);
  const visibleSummary = useMemo(() => {
    const serviceCount = visibleItems.filter((item) => item.event_type.trim().toUpperCase() === "SERVICE").length;
    const installCount = visibleItems.filter((item) => item.event_type.trim().toUpperCase() !== "SERVICE").length;
    const linkedProjectsCount = visibleItems.filter((item) => item.project_id).length;
    return {
      serviceCount,
      installCount,
      linkedProjectsCount,
    };
  }, [t, visibleItems]);
  const projectLanes = useMemo(() => {
    const lanes = new Map<
      string,
      {
        key: string;
        title: string;
        projectId: string | null;
        items: typeof visibleItems;
      }
    >();
    for (const item of visibleItems) {
      const key = item.project_id || `unlinked:${item.id}`;
      const current = lanes.get(key) || {
        key,
        title: item.project_id ? `${t("common.project")} ${item.project_id}` : t("common.noProject"),
        projectId: item.project_id,
        items: [],
      };
      current.items.push(item);
      lanes.set(key, current);
    }
    return Array.from(lanes.values()).sort((a, b) => {
      if (a.projectId && !b.projectId) return -1;
      if (!a.projectId && b.projectId) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [visibleItems]);
  const serviceLaneItems = useMemo(
    () => visibleItems.filter((item) => item.event_type.trim().toUpperCase() === "SERVICE"),
    [visibleItems]
  );

  useEffect(() => {
    if (selectedDay !== "ALL" && !dayOptions.includes(selectedDay)) {
      setSelectedDay("ALL");
    }
  }, [dayOptions, selectedDay]);

  useEffect(() => {
    const incomingDay = typeof params.day === "string" ? params.day.trim() : "";
    if (incomingDay) {
      setSelectedDay(incomingDay);
    }
  }, [params.day]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={[titleStyle, { textAlign: isRTL ? "right" : "left" }]}>{t("calendar.title")}</Text>
          <Text style={[bodyStyle, { textAlign: isRTL ? "right" : "left" }]}>{t("calendar.subtitle")}</Text>
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
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("calendar.dayFocus")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chipRowStyle}>
            <Pressable onPress={() => setSelectedDay("ALL")} style={[chipStyle, selectedDay === "ALL" && chipStyleActive]}>
              <Text style={{ color: selectedDay === "ALL" ? "#04111f" : "#d9e7f7", fontWeight: "600" }}>{t("calendar.all7Days")}</Text>
            </Pressable>
            {dayOptions.map((day) => (
              <Pressable key={day} onPress={() => setSelectedDay(day)} style={[chipStyle, selectedDay === day && chipStyleActive]}>
                <Text style={{ color: selectedDay === day ? "#04111f" : "#d9e7f7", fontWeight: "600" }}>{day}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ gap: 8, marginTop: 14 }}>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>{t("calendar.focusedDay")}</Text>
              <Text style={summaryValueStyle}>{selectedDay === "ALL" ? t("common.all") : selectedDay}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>{t("calendar.visibleEvents")}</Text>
              <Text style={summaryValueStyle}>{visibleItems.length}</Text>
            </View>
          </View>
          {selectedDay !== "ALL" ? (
            <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
              <Pressable
                onPress={() => router.push(`/earnings?focus=DAY&day=${encodeURIComponent(selectedDay)}` as never)}
                style={[secondaryButton, { flex: 1 }]}
              >
                <Text style={secondaryButtonText}>{t("calendar.openDayEarnings")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("calendar.quickSummary")}</Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>{t("calendar.serviceEvents")}</Text>
              <Text style={summaryValueStyle}>{visibleSummary.serviceCount}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>{t("calendar.installEvents")}</Text>
              <Text style={summaryValueStyle}>{visibleSummary.installCount}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>{t("calendar.projectLinkedItems")}</Text>
              <Text style={summaryValueStyle}>{visibleSummary.linkedProjectsCount}</Text>
            </View>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("calendar.projectLanes")}</Text>
          {projectLanes.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {projectLanes.map((lane) => {
                const serviceCount = lane.items.filter((item) => item.event_type.trim().toUpperCase() === "SERVICE").length;
                return (
                  <View key={lane.key} style={eventCardStyle}>
                    <Text style={eventTitleStyle}>{lane.title}</Text>
                    <Text style={bodyStyle}>{t("common.events")}: {lane.items.length}</Text>
                    <Text style={bodyStyle}>{t("calendar.serviceEvents")}: {serviceCount}</Text>
                    <Text style={bodyStyle}>{t("calendar.installEvents")}: {lane.items.length - serviceCount}</Text>
                    {lane.projectId ? (
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                        <Pressable
                          onPress={() => router.push(`/project/${lane.projectId}` as never)}
                          style={[secondaryButton, { flex: 1 }]}
                        >
                          <Text style={secondaryButtonText}>{t("calendar.openLaneProject")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => router.push(`/project/${lane.projectId}?issueStatus=OPEN` as never)}
                          style={[secondaryButton, { flex: 1 }]}
                        >
                          <Text style={secondaryButtonText}>{t("calendar.openLaneIssues")}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={bodyStyle}>{t("calendar.noProjectLanes")}</Text>
          )}
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("calendar.serviceLane")}</Text>
          {serviceLaneItems.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {serviceLaneItems.map((item) => (
                <View key={item.id} style={eventCardStyle}>
                  <Text style={eventTitleStyle}>{item.title}</Text>
                  <Text style={bodyStyle}>{t("common.starts")}: {item.starts_at}</Text>
                  <Text style={bodyStyle}>{t("common.project")}: {item.project_id || t("common.noProject")}</Text>
                  {item.location ? <Text style={bodyStyle}>{t("common.location")}: {item.location}</Text> : null}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    {item.project_id ? (
                      <Pressable
                        onPress={() => {
                          const route = buildIssueRouteFromCalendarEvent(item);
                          if (route) {
                            router.push(route as never);
                          }
                        }}
                        style={[secondaryButton, { flex: 1 }]}
                      >
                        <Text style={secondaryButtonText}>{t("calendar.openIssueContext")}</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => router.push("/earnings" as never)} style={[secondaryButton, { flex: 1 }]}>
                        <Text style={secondaryButtonText}>{t("calendar.openEarnings")}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={bodyStyle}>{t("calendar.noServiceItems")}</Text>
          )}
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("calendar.upcomingEvents")}</Text>
          {visibleItems.length ? (
            visibleItems.map((item) => {
              const projectId = item.project_id;
              return (
              <View key={item.id} style={eventCardStyle}>
                <Text style={eventTitleStyle}>{item.title}</Text>
                <Text style={bodyStyle}>{t("common.type")}: {item.event_type}</Text>
                <Text style={bodyStyle}>{t("common.starts")}: {item.starts_at}</Text>
                <Text style={bodyStyle}>{t("common.ends")}: {item.ends_at}</Text>
                <Text style={bodyStyle}>{t("common.project")}: {projectId || t("common.noProject")}</Text>
                {item.location ? <Text style={bodyStyle}>{t("common.location")}: {item.location}</Text> : null}
                {projectId ? (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable
                      onPress={() => {
                        const route = buildProjectRouteFromCalendarEvent(item);
                        if (route) {
                          router.push(route as never);
                        }
                      }}
                      style={[secondaryButton, { flex: 1 }]}
                    >
                      <Text style={secondaryButtonText}>{t("calendar.openProject")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const route =
                          item.event_type.toUpperCase() === "SERVICE"
                            ? buildIssueRouteFromCalendarEvent(item)
                            : buildDoorPrepRoute(projectId);
                        if (route) {
                          router.push(route as never);
                        }
                      }}
                      style={[secondaryButton, { flex: 1 }]}
                    >
                      <Text style={secondaryButtonText}>
                        {item.event_type.toUpperCase() === "SERVICE" ? t("calendar.openIssues") : t("calendar.prepDoors")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )})
          ) : (
            <Text style={bodyStyle}>
              {snapshot ? t("calendar.noEvents") : t("calendar.routeReady")}
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

const eventCardStyle = {
  backgroundColor: "#0d2034",
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "#183653",
  padding: 14,
  marginTop: 10,
} as const;

const eventTitleStyle = {
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

const summaryRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const summaryValueStyle = {
  color: "#f8fbff",
  fontWeight: "700",
} as const;
