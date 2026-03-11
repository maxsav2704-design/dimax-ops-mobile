import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import type { InstallerCalendarViewModel } from "@/modules/calendar/types";
import {
  buildDoorPrepRoute,
  buildIssueRouteFromCalendarEvent,
  buildProjectRouteFromCalendarEvent,
} from "@/modules/projects/navigation";

export default function CalendarScreen() {
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
  }, [visibleItems]);

  useEffect(() => {
    if (selectedDay !== "ALL" && !dayOptions.includes(selectedDay)) {
      setSelectedDay("ALL");
    }
  }, [dayOptions, selectedDay]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={titleStyle}>Installer Calendar</Text>
          <Text style={bodyStyle}>
            Read-only mobile calendar baseline for assigned installer events.
          </Text>
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
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>Day focus</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chipRowStyle}>
            <Pressable onPress={() => setSelectedDay("ALL")} style={[chipStyle, selectedDay === "ALL" && chipStyleActive]}>
              <Text style={{ color: selectedDay === "ALL" ? "#04111f" : "#d9e7f7", fontWeight: "600" }}>All 7 days</Text>
            </Pressable>
            {dayOptions.map((day) => (
              <Pressable key={day} onPress={() => setSelectedDay(day)} style={[chipStyle, selectedDay === day && chipStyleActive]}>
                <Text style={{ color: selectedDay === day ? "#04111f" : "#d9e7f7", fontWeight: "600" }}>{day}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ gap: 8, marginTop: 14 }}>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>Focused day</Text>
              <Text style={summaryValueStyle}>{selectedDay === "ALL" ? "All" : selectedDay}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>Visible events</Text>
              <Text style={summaryValueStyle}>{visibleItems.length}</Text>
            </View>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>Day quick summary</Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>Service events</Text>
              <Text style={summaryValueStyle}>{visibleSummary.serviceCount}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>Install events</Text>
              <Text style={summaryValueStyle}>{visibleSummary.installCount}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={bodyStyle}>Project-linked items</Text>
              <Text style={summaryValueStyle}>{visibleSummary.linkedProjectsCount}</Text>
            </View>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>Upcoming events</Text>
          {visibleItems.length ? (
            visibleItems.map((item) => {
              const projectId = item.project_id;
              return (
              <View key={item.id} style={eventCardStyle}>
                <Text style={eventTitleStyle}>{item.title}</Text>
                <Text style={bodyStyle}>Type: {item.event_type}</Text>
                <Text style={bodyStyle}>Starts: {item.starts_at}</Text>
                <Text style={bodyStyle}>Ends: {item.ends_at}</Text>
                <Text style={bodyStyle}>Project: {projectId || "No project"}</Text>
                {item.location ? <Text style={bodyStyle}>Location: {item.location}</Text> : null}
                {projectId ? (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable
                      onPress={() => {
                        const route = buildProjectRouteFromCalendarEvent(item);
                        if (route) {
                          router.push(route);
                        }
                      }}
                      style={[secondaryButton, { flex: 1 }]}
                    >
                      <Text style={secondaryButtonText}>Open project</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const route =
                          item.event_type.toUpperCase() === "SERVICE"
                            ? buildIssueRouteFromCalendarEvent(item)
                            : buildDoorPrepRoute(projectId);
                        if (route) {
                          router.push(route);
                        }
                      }}
                      style={[secondaryButton, { flex: 1 }]}
                    >
                      <Text style={secondaryButtonText}>
                        {item.event_type.toUpperCase() === "SERVICE" ? "Open issues" : "Prep doors"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )})
          ) : (
            <Text style={bodyStyle}>
              {snapshot ? "No events in the current day focus." : "Calendar route is ready for real installer events."}
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
