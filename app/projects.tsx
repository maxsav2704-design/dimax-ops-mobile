import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import type { InstallerCalendarViewModel } from "@/modules/calendar/types";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";
import {
  buildIssueProjectRoute,
  buildPriorityRoute,
  buildProblemProjectRoute,
  buildProjectRoute,
} from "@/modules/projects/navigation";
import { listProjects } from "@/modules/projects/repository";
import type { ProjectListItem } from "@/modules/projects/types";
import { bootstrapOnlineData, countPendingEvents, getLastSyncAt, getSyncQueueSummary, runSync } from "@/modules/sync/service";
import type { SyncQueueSummary } from "@/modules/sync/types";
import { useAuth } from "@/providers/AppProviders";

export default function ProjectsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [queueSummary, setQueueSummary] = useState<SyncQueueSummary | null>(null);
  const [calendarState, setCalendarState] = useState<InstallerCalendarViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [earningsState, setEarningsState] = useState<InstallerEarningsViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const [projects, lastSync, pending, summary, calendar, earnings] = await Promise.all([
      listProjects(),
      getLastSyncAt(),
      countPendingEvents(),
      getSyncQueueSummary(),
      loadInstallerCalendar("7d"),
      loadInstallerEarnings(),
    ]);
    setItems(projects);
    setLastSyncAt(lastSync);
    setPendingCount(pending);
    setQueueSummary(summary);
    setCalendarState(calendar);
    setEarningsState(earnings);
  };

  useEffect(() => {
    reload();
  }, []);

  const hydrate = async () => {
    setBusy(true);
    setError(null);
    try {
      await bootstrapOnlineData();
      await runSync({ forceRetry: true });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bootstrap failed");
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setError(null);
    try {
      await runSync({ forceRetry: true });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const todayTasksCount = useMemo(() => {
    const items = calendarState.snapshot?.items || [];
    const todayKey = new Date().toISOString().slice(0, 10);
    return items.filter((item) => item.starts_at.slice(0, 10) === todayKey).length;
  }, [calendarState.snapshot]);

  const problemProjects = useMemo(
    () => items.filter((item) => item.status === "PROBLEM"),
    [items]
  );

  const topPriorities = useMemo(() => {
    const eventItems = (calendarState.snapshot?.items || [])
      .filter((item) => item.project_id)
      .slice(0, 3);
    return eventItems.map((item) => ({
      key: item.id,
      title: item.title,
      subtitle: item.starts_at,
      projectId: item.project_id as string,
      eventType: item.event_type,
    }));
  }, [calendarState.snapshot]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={{ color: "#f8fbff", fontSize: 22, fontWeight: "700" }}>Installer Workspace</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 6 }}>{user?.full_name}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 4 }}>Last sync: {lastSyncAt || "never"}</Text>
          <Text style={{ color: pendingCount > 0 ? "#ffb86b" : "#63d297", marginTop: 4 }}>
            Pending offline events: {pendingCount}
          </Text>
          <Text style={{ color: "#8fa7c2", marginTop: 4 }}>
            Queue health: pending {queueSummary?.pending || 0} / failed {queueSummary?.failed || 0} / blocked {queueSummary?.blocked || 0}
          </Text>
          <Text style={{ color: "#8fa7c2", marginTop: 4 }}>
            Ready now: {queueSummary?.ready_to_send || 0}
            {queueSummary?.next_retry_at ? ` | next retry ${queueSummary.next_retry_at}` : ""}
          </Text>
        </View>

        <View style={summaryGridStyle}>
          <View style={summaryCardStyle}>
            <Text style={summaryEyebrowStyle}>Today tasks</Text>
            <Text style={summaryValueStyle}>{todayTasksCount}</Text>
            <Text style={summaryMetaStyle}>Source: {calendarState.source}</Text>
          </View>
          <View style={summaryCardStyle}>
            <Text style={summaryEyebrowStyle}>Today earnings</Text>
            <Text style={summaryValueStyle}>{earningsState.snapshot?.today_total || "--"}</Text>
            <Text style={summaryMetaStyle}>Source: {earningsState.source}</Text>
          </View>
          <View style={summaryCardStyle}>
            <Text style={summaryEyebrowStyle}>This month</Text>
            <Text style={summaryValueStyle}>{earningsState.snapshot?.month_total || "--"}</Text>
            <Text style={summaryMetaStyle}>Problem projects: {problemProjects.length}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={hydrate} style={[primaryButton, busy && { opacity: 0.6 }]} disabled={busy}>
            <Text style={primaryButtonText}>{busy ? "Working..." : "Bootstrap"}</Text>
          </Pressable>
          <Pressable onPress={syncNow} style={[secondaryButton, busy && { opacity: 0.6 }]} disabled={busy}>
            <Text style={secondaryButtonText}>Sync Now</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={() => router.push("/calendar" as never)} style={secondaryButton}>
            <Text style={secondaryButtonText}>Calendar</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/earnings" as never)} style={secondaryButton}>
            <Text style={secondaryButtonText}>Earnings</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={() => router.push("/sync-queue" as never)} style={secondaryButton}>
            <Text style={secondaryButtonText}>Queue</Text>
          </Pressable>
          <Pressable onPress={signOut} style={secondaryButton}>
            <Text style={secondaryButtonText}>Logout</Text>
          </Pressable>
        </View>

        {error ? <Text style={{ color: "#ff8b8b" }}>{error}</Text> : null}

        <View style={cardStyle}>
          <Text style={sectionTitle}>Today priorities</Text>
          {topPriorities.length ? (
            topPriorities.map((item) => (
              <Pressable
                key={item.key}
                style={priorityCardStyle}
                onPress={() =>
                  router.push(buildPriorityRoute(item))
                }
              >
                <Text style={priorityTitleStyle}>{item.title}</Text>
                <Text style={priorityMetaStyle}>{item.subtitle}</Text>
                <Text style={priorityMetaStyle}>Project: {item.projectId}</Text>
                <Text style={priorityMetaStyle}>Type: {item.eventType}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={{ color: "#8fa7c2", marginTop: 8 }}>
              No priority events in the current calendar snapshot.
            </Text>
          )}
        </View>

        {problemProjects.length ? (
          <View style={cardStyle}>
            <Text style={sectionTitle}>Problem projects</Text>
            {problemProjects.slice(0, 3).map((item) => (
              <Pressable
                key={item.id}
                style={priorityCardStyle}
                onPress={() => router.push(buildProblemProjectRoute(item))}
              >
                <Text style={priorityTitleStyle}>{item.name}</Text>
                <Text style={priorityMetaStyle}>{item.address || "No address"}</Text>
                <Text style={[priorityMetaStyle, { color: "#ffb86b" }]}>Open issues context</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          {items.map((item) => (
            <View key={item.id} style={cardStyle}>
              <Pressable onPress={() => router.push(buildProjectRoute(item.id))}>
                <Text style={{ color: "#f8fbff", fontSize: 18, fontWeight: "600" }}>{item.name}</Text>
                <Text style={{ color: "#8fa7c2", marginTop: 6 }}>{item.address || "No address"}</Text>
                <Text style={{ color: item.status === "PROBLEM" ? "#ffb86b" : "#63d297", marginTop: 8 }}>{item.status}</Text>
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable onPress={() => router.push(buildProjectRoute(item.id))} style={[secondaryButton, { flex: 1 }]}>
                  <Text style={secondaryButtonText}>Open project</Text>
                </Pressable>
                {item.status === "PROBLEM" ? (
                  <Pressable
                    onPress={() => router.push(buildIssueProjectRoute(item.id, { doorSearch: item.name }))}
                    style={[secondaryButton, { flex: 1 }]}
                  >
                    <Text style={secondaryButtonText}>Open issues</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {!items.length ? (
            <View style={cardStyle}>
              <Text style={{ color: "#8fa7c2" }}>No local projects yet. Use Bootstrap to pull assigned projects and seed offline storage.</Text>
            </View>
          ) : null}
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

const primaryButton = {
  flex: 1,
  backgroundColor: "#5aa8ff",
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
} as const;

const secondaryButton = {
  flex: 1,
  backgroundColor: "#0c1d30",
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "#17314f",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
} as const;

const primaryButtonText = {
  color: "#04111f",
  fontWeight: "700",
} as const;

const secondaryButtonText = {
  color: "#f8fbff",
  fontWeight: "600",
} as const;

const summaryGridStyle = {
  gap: 12,
} as const;

const summaryCardStyle = {
  backgroundColor: "#0d2034",
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "#183653",
  padding: 16,
} as const;

const summaryEyebrowStyle = {
  color: "#8fa7c2",
  fontSize: 12,
  textTransform: "uppercase",
} as const;

const summaryValueStyle = {
  color: "#f8fbff",
  fontSize: 24,
  fontWeight: "700",
  marginTop: 8,
} as const;

const summaryMetaStyle = {
  color: "#8fa7c2",
  marginTop: 6,
} as const;

const sectionTitle = {
  color: "#f8fbff",
  fontSize: 18,
  fontWeight: "700",
} as const;

const priorityCardStyle = {
  backgroundColor: "#0d2034",
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "#183653",
  padding: 14,
  marginTop: 10,
} as const;

const priorityTitleStyle = {
  color: "#f8fbff",
  fontSize: 15,
  fontWeight: "700",
} as const;

const priorityMetaStyle = {
  color: "#8fa7c2",
  marginTop: 6,
} as const;
