import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const [projects, lastSync, pending, summary] = await Promise.all([
      listProjects(),
      getLastSyncAt(),
      countPendingEvents(),
      getSyncQueueSummary(),
    ]);
    setItems(projects);
    setLastSyncAt(lastSync);
    setPendingCount(pending);
    setQueueSummary(summary);
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

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={hydrate} style={[primaryButton, busy && { opacity: 0.6 }]} disabled={busy}>
            <Text style={primaryButtonText}>{busy ? "Working..." : "Bootstrap"}</Text>
          </Pressable>
          <Pressable onPress={syncNow} style={[secondaryButton, busy && { opacity: 0.6 }]} disabled={busy}>
            <Text style={secondaryButtonText}>Sync Now</Text>
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

        <View style={{ gap: 12 }}>
          {items.map((item) => (
            <Pressable key={item.id} style={cardStyle} onPress={() => router.push(`/project/${item.id}`)}>
              <Text style={{ color: "#f8fbff", fontSize: 18, fontWeight: "600" }}>{item.name}</Text>
              <Text style={{ color: "#8fa7c2", marginTop: 6 }}>{item.address || "No address"}</Text>
              <Text style={{ color: item.status === "PROBLEM" ? "#ffb86b" : "#63d297", marginTop: 8 }}>{item.status}</Text>
            </Pressable>
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
