import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
          <Text style={sectionTitle}>Upcoming events</Text>
          {snapshot?.items.length ? (
            snapshot.items.map((item) => {
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
              {snapshot ? "No events in the current range." : "Calendar route is ready for real installer events."}
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
