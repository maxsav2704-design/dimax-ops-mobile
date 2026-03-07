import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { getProject, listProjects } from "@/modules/projects/repository";
import { buildEventSummary, getStatusTone } from "@/modules/sync/presentation";
import {
  dropPendingEvent,
  getSyncQueueSummary,
  listPendingEvents,
  retryPendingEventNow,
  runSync,
} from "@/modules/sync/service";
import type { PendingSyncEvent, SyncQueueSummary } from "@/modules/sync/types";

export default function SyncQueueScreen() {
  const [items, setItems] = useState<PendingSyncEvent[]>([]);
  const [queueSummary, setQueueSummary] = useState<SyncQueueSummary | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const [pending, summary, projects] = await Promise.all([
      listPendingEvents(),
      getSyncQueueSummary(),
      listProjects(),
    ]);

    const missingProjectIds = pending
      .map((event) => event.project_id)
      .filter((projectId) => !projects.find((project) => project.id === projectId));

    const extraProjects = await Promise.all(
      Array.from(new Set(missingProjectIds)).map(async (projectId) => {
        const project = await getProject(projectId);
        return project ? [project.id, project.name] as const : null;
      })
    );

    const nextProjectNames: Record<string, string> = {};
    for (const project of projects) {
      nextProjectNames[project.id] = project.name;
    }
    for (const project of extraProjects) {
      if (project) {
        nextProjectNames[project[0]] = project[1];
      }
    }

    const priority = { BLOCKED: 0, FAILED: 1, PENDING: 2 } as const;
    pending.sort((left, right) => {
      const statusGap = priority[left.status] - priority[right.status];
      if (statusGap !== 0) {
        return statusGap;
      }
      return right.created_at.localeCompare(left.created_at);
    });

    setItems(pending);
    setQueueSummary(summary);
    setProjectNames(nextProjectNames);
  };

  useEffect(() => {
    void reload();
  }, []);

  const blockedItems = useMemo(
    () => items.filter((item) => item.status === "BLOCKED"),
    [items]
  );

  const retryItem = async (clientEventId: string) => {
    setBusyId(clientEventId);
    setError(null);
    try {
      await retryPendingEventNow(clientEventId);
      await runSync({ forceRetry: true });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Queue retry failed");
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const dropItem = async (clientEventId: string) => {
    setBusyId(clientEventId);
    setError(null);
    try {
      await dropPendingEvent(clientEventId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Queue drop failed");
    } finally {
      setBusyId(null);
    }
  };

  const retryBlockedNow = async () => {
    if (!blockedItems.length) {
      return;
    }

    setBulkBusy(true);
    setError(null);
    try {
      for (const item of blockedItems) {
        await retryPendingEventNow(item.client_event_id);
      }
      await runSync({ forceRetry: true });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk retry failed");
      await reload();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={{ color: "#f8fbff", fontSize: 22, fontWeight: "700" }}>Sync Queue Resolution</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 6 }}>
            Pending {queueSummary?.pending || 0} / Failed {queueSummary?.failed || 0} / Blocked {queueSummary?.blocked || 0}
          </Text>
          <Text style={{ color: "#8fa7c2", marginTop: 4 }}>
            Ready now: {queueSummary?.ready_to_send || 0}
            {queueSummary?.next_retry_at ? ` | next retry ${queueSummary.next_retry_at}` : ""}
          </Text>
          {queueSummary?.blocked ? (
            <Text style={{ color: "#ffb86b", marginTop: 10 }}>
              Blocked items need manual action. Retry only if the root cause is fixed.
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={retryBlockedNow} style={[primaryButton, bulkBusy && { opacity: 0.6 }]} disabled={bulkBusy || !blockedItems.length}>
            <Text style={primaryButtonText}>{bulkBusy ? "Working..." : "Retry blocked now"}</Text>
          </Pressable>
          <Pressable onPress={() => void reload()} style={secondaryButton}>
            <Text style={secondaryButtonText}>Refresh queue</Text>
          </Pressable>
        </View>

        {error ? <Text style={{ color: "#ff8b8b" }}>{error}</Text> : null}

        {!items.length ? (
          <View style={cardStyle}>
            <Text style={{ color: "#8fa7c2" }}>Sync queue is empty. Offline actions have either synced or none were created yet.</Text>
          </View>
        ) : null}

        {items.map((item) => {
          const projectName = projectNames[item.project_id] || item.project_id;
          const isBusy = busyId === item.client_event_id;

          return (
            <View key={item.client_event_id} style={cardStyle}>
              <Text style={{ color: "#f8fbff", fontSize: 17, fontWeight: "700" }}>{buildEventSummary(item)}</Text>
              <Text style={{ color: "#8fa7c2", marginTop: 6 }}>Project: {projectName}</Text>
              <Text style={{ color: getStatusTone(item.status), marginTop: 4, fontWeight: "700" }}>
                {item.status}
              </Text>
              <Text style={{ color: "#8fa7c2", marginTop: 4 }}>Queued: {item.created_at}</Text>
              <Text style={{ color: "#8fa7c2", marginTop: 4 }}>Attempts: {item.attempts}</Text>
              {item.last_attempt_at ? (
                <Text style={{ color: "#8fa7c2", marginTop: 4 }}>Last attempt: {item.last_attempt_at}</Text>
              ) : null}
              {item.next_retry_at ? (
                <Text style={{ color: "#8fa7c2", marginTop: 4 }}>Next retry: {item.next_retry_at}</Text>
              ) : null}
              {item.error ? <Text style={{ color: "#ff8b8b", marginTop: 8 }}>{item.error}</Text> : null}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={() => void retryItem(item.client_event_id)}
                  style={[primaryButton, { flex: 1 }, isBusy && { opacity: 0.6 }]}
                  disabled={isBusy}
                >
                  <Text style={primaryButtonText}>{isBusy ? "Working..." : "Retry now"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void dropItem(item.client_event_id)}
                  style={[dangerButton, { flex: 1 }, isBusy && { opacity: 0.6 }]}
                  disabled={isBusy}
                >
                  <Text style={dangerButtonText}>Drop event</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
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
  backgroundColor: "#5aa8ff",
  borderRadius: 12,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
} as const;

const secondaryButton = {
  backgroundColor: "#0c1d30",
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#17314f",
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
} as const;

const dangerButton = {
  backgroundColor: "#2a1420",
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#7f334d",
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
} as const;

const primaryButtonText = {
  color: "#04111f",
  fontWeight: "700",
} as const;

const secondaryButtonText = {
  color: "#f8fbff",
  fontWeight: "600",
} as const;

const dangerButtonText = {
  color: "#ffd7e1",
  fontWeight: "700",
} as const;
