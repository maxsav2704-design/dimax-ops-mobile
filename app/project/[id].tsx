import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { addAddonFact, markDoorInstalled, markDoorNotInstalled } from "@/modules/doors/actions";
import {
  getProject,
  listProjectAddonTypes,
  listProjectDoors,
  listProjectIssues,
  listReasons,
} from "@/modules/projects/repository";
import type {
  InstallerDoor,
  ProjectAddonTypeOption,
  ProjectIssue,
  ProjectListItem,
} from "@/modules/projects/types";
import { getSyncQueueSummary, listPendingEvents, runSync } from "@/modules/sync/service";
import type { PendingSyncEvent, SyncQueueSummary } from "@/modules/sync/types";

export default function ProjectDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = id || "";
  const [project, setProject] = useState<ProjectListItem | null>(null);
  const [doors, setDoors] = useState<InstallerDoor[]>([]);
  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [addonTypes, setAddonTypes] = useState<ProjectAddonTypeOption[]>([]);
  const [pendingEvents, setPendingEvents] = useState<PendingSyncEvent[]>([]);
  const [queueSummary, setQueueSummary] = useState<SyncQueueSummary | null>(null);
  const [reasons, setReasons] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [comment, setComment] = useState("");
  const [addonTypeId, setAddonTypeId] = useState("");
  const [addonQty, setAddonQty] = useState("1");
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>("ALL");
  const [selectedLocationCode, setSelectedLocationCode] = useState<string>("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!projectId) return;
    const [projectRow, doorRows, issueRows, reasonRows, addonTypeRows, pendingRows, queueSummaryRow] = await Promise.all([
      getProject(projectId),
      listProjectDoors(projectId),
      listProjectIssues(projectId),
      listReasons(),
      listProjectAddonTypes(projectId),
      listPendingEvents(projectId),
      getSyncQueueSummary(projectId),
    ]);
    setProject(projectRow);
    setDoors(doorRows);
    setIssues(issueRows);
    setAddonTypes(addonTypeRows);
    setPendingEvents(pendingRows);
    setQueueSummary(queueSummaryRow);
    setReasons(reasonRows);
    if (!selectedReasonId && reasonRows[0]?.id) {
      setSelectedReasonId(reasonRows[0].id);
    }
    if (!addonTypeId && addonTypeRows[0]?.id) {
      setAddonTypeId(addonTypeRows[0].id);
    }
  };

  useEffect(() => {
    reload();
  }, [projectId]);

  const orderNumbers = useMemo(
    () => Array.from(new Set(doors.map((door) => door.order_number).filter(Boolean) as string[])).sort(),
    [doors]
  );

  const locationCodes = useMemo(
    () => Array.from(new Set(doors.map((door) => door.location_code).filter(Boolean) as string[])).sort(),
    [doors]
  );

  const filteredDoors = useMemo(() => {
    return doors.filter((door) => {
      const orderMatch = selectedOrderNumber === "ALL" || door.order_number === selectedOrderNumber;
      const locationMatch = selectedLocationCode === "ALL" || door.location_code === selectedLocationCode;
      return orderMatch && locationMatch;
    });
  }, [doors, selectedLocationCode, selectedOrderNumber]);

  const groupedDoors = useMemo(() => {
    return filteredDoors.reduce<Record<string, InstallerDoor[]>>((acc, door) => {
      const key = `${door.floor_label || "No floor"}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(door);
      return acc;
    }, {});
  }, [filteredDoors]);

  const handleInstall = async (doorId: string) => {
    setBusy(true);
    setError(null);
    try {
      await markDoorInstalled(projectId, doorId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Door update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleNotInstalled = async (doorId: string) => {
    if (!selectedReasonId) return;
    setBusy(true);
    setError(null);
    try {
      await markDoorNotInstalled(projectId, doorId, selectedReasonId, comment);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Door update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddonFact = async () => {
    if (!addonTypeId || !addonQty) return;
    setBusy(true);
    setError(null);
    try {
      await addAddonFact(projectId, addonTypeId, addonQty, comment);
      setAddonQty("1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add-on queue failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
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
          <Text style={{ color: "#f8fbff", fontSize: 22, fontWeight: "700" }}>{project?.name || "Project"}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 6 }}>{project?.address || "No address"}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 6 }}>Open issues: {issues.length}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 2 }}>Doors: {doors.length}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 2 }}>Visible after filters: {filteredDoors.length}</Text>
          <Text style={{ color: pendingEvents.length > 0 ? "#ffb86b" : "#63d297", marginTop: 2 }}>
            Pending project events: {pendingEvents.length}
          </Text>
          <Text style={{ color: "#8fa7c2", marginTop: 2 }}>
            Queue health: pending {queueSummary?.pending || 0} / failed {queueSummary?.failed || 0} / blocked {queueSummary?.blocked || 0}
          </Text>
          <Text style={{ color: "#8fa7c2", marginTop: 2 }}>
            Ready now: {queueSummary?.ready_to_send || 0}
            {queueSummary?.next_retry_at ? ` | next retry ${queueSummary.next_retry_at}` : ""}
          </Text>
        </View>

        <Pressable onPress={handleSync} style={secondaryButton}>
          <Text style={secondaryButtonText}>{busy ? "Working..." : "Sync queued work"}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/sync-queue" as never)} style={secondaryButton}>
          <Text style={secondaryButtonText}>Open sync queue</Text>
        </Pressable>

        {error ? <Text style={{ color: "#ff8b8b" }}>{error}</Text> : null}

        <View style={cardStyle}>
          <Text style={sectionTitle}>Door filters</Text>
          <Text style={fieldLabel}>Order number</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            <Pressable onPress={() => setSelectedOrderNumber("ALL")} style={[chipStyle, selectedOrderNumber === "ALL" && chipStyleActive]}>
              <Text style={{ color: selectedOrderNumber === "ALL" ? "#04111f" : "#d9e7f7" }}>All orders</Text>
            </Pressable>
            {orderNumbers.map((orderNumber) => (
              <Pressable key={orderNumber} onPress={() => setSelectedOrderNumber(orderNumber)} style={[chipStyle, selectedOrderNumber === orderNumber && chipStyleActive]}>
                <Text style={{ color: selectedOrderNumber === orderNumber ? "#04111f" : "#d9e7f7" }}>{orderNumber}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={fieldLabel}>Location code</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            <Pressable onPress={() => setSelectedLocationCode("ALL")} style={[chipStyle, selectedLocationCode === "ALL" && chipStyleActive]}>
              <Text style={{ color: selectedLocationCode === "ALL" ? "#04111f" : "#d9e7f7" }}>All locations</Text>
            </Pressable>
            {locationCodes.map((locationCode) => (
              <Pressable key={locationCode} onPress={() => setSelectedLocationCode(locationCode)} style={[chipStyle, selectedLocationCode === locationCode && chipStyleActive]}>
                <Text style={{ color: selectedLocationCode === locationCode ? "#04111f" : "#d9e7f7" }}>{locationCode}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {issues.length ? (
          <View style={warningCardStyle}>
            <Text style={warningTitleStyle}>Open issue queue</Text>
            <View style={{ gap: 10, marginTop: 10 }}>
              {issues.map((issue) => (
                <View key={issue.id} style={warningRowStyle}>
                  <Text style={{ color: "#fff3d6", fontWeight: "700" }}>{issue.title || "Issue"}</Text>
                  <Text style={{ color: "#f2cf8b", marginTop: 4 }}>{issue.details || "Requires installer attention"}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={cardStyle}>
          <Text style={sectionTitle}>Offline actions</Text>
          <Text style={fieldLabel}>Reason for NOT_INSTALLED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {reasons.map((reason) => (
              <Pressable key={reason.id} onPress={() => setSelectedReasonId(reason.id)} style={[chipStyle, selectedReasonId === reason.id && chipStyleActive]}>
                <Text style={{ color: selectedReasonId === reason.id ? "#04111f" : "#d9e7f7" }}>{reason.code}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput value={comment} onChangeText={setComment} placeholder="Comment for issue or add-on" placeholderTextColor="#6b85a4" multiline style={[inputStyle, { marginTop: 12, minHeight: 90 }]} />
          <Text style={fieldLabel}>Add-on type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {addonTypes.map((addon) => (
              <Pressable key={addon.id} onPress={() => setAddonTypeId(addon.id)} style={[chipStyle, addonTypeId === addon.id && chipStyleActive]}>
                <Text style={{ color: addonTypeId === addon.id ? "#04111f" : "#d9e7f7" }}>
                  {addon.name}{addon.qty_planned ? ` | ${addon.qty_planned} ${addon.unit}` : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput value={addonQty} onChangeText={setAddonQty} placeholder="Qty done" placeholderTextColor="#6b85a4" style={[inputStyle, { marginTop: 12 }]} keyboardType="numeric" />
          <Pressable onPress={handleAddonFact} style={[primaryButton, { marginTop: 12 }]}>
            <Text style={primaryButtonText}>Queue add-on fact</Text>
          </Pressable>
        </View>

        {pendingEvents.length ? (
          <View style={cardStyle}>
            <Text style={sectionTitle}>Pending sync queue</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {pendingEvents.map((event) => (
                <View key={event.client_event_id} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{event.type}</Text>
                  <Text style={metaStyle}>Queued: {event.created_at}</Text>
                  <Text style={metaStyle}>Status: {event.status}</Text>
                  <Text style={metaStyle}>Attempts: {event.attempts}</Text>
                  {event.last_attempt_at ? <Text style={metaStyle}>Last attempt: {event.last_attempt_at}</Text> : null}
                  {event.next_retry_at ? <Text style={metaStyle}>Next retry: {event.next_retry_at}</Text> : null}
                  {event.error ? <Text style={{ color: "#ff8b8b", marginTop: 4 }}>{event.error}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {Object.entries(groupedDoors).map(([floor, floorDoors]) => (
          <View key={floor} style={cardStyle}>
            <Text style={sectionTitle}>Floor {floor}</Text>
            <View style={{ gap: 12, marginTop: 12 }}>
              {floorDoors.map((door) => (
                <View key={door.id} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{door.unit_label}</Text>
                  <Text style={metaStyle}>Order: {door.order_number || "-"}</Text>
                  <Text style={metaStyle}>House: {door.house_number || "-"}</Text>
                  <Text style={metaStyle}>Floor: {door.floor_label || "-"}</Text>
                  <Text style={metaStyle}>Apartment: {door.apartment_number || "-"}</Text>
                  <Text style={metaStyle}>Location: {door.location_code || "-"}</Text>
                  <Text style={metaStyle}>Marking: {door.door_marking || "-"}</Text>
                  <Text style={[metaStyle, { color: door.status === "INSTALLED" ? "#63d297" : "#ffb86b" }]}>{door.status}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <Pressable onPress={() => handleInstall(door.id)} style={[primaryButton, { flex: 1 }]} disabled={busy || door.is_locked}>
                      <Text style={primaryButtonText}>Installed</Text>
                    </Pressable>
                    <Pressable onPress={() => handleNotInstalled(door.id)} style={[secondaryButton, { flex: 1 }]} disabled={busy}>
                      <Text style={secondaryButtonText}>Not installed</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
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

const doorCardStyle = {
  backgroundColor: "#0d2034",
  borderRadius: 14,
  padding: 14,
  borderWidth: 1,
  borderColor: "#183653",
} as const;

const inputStyle = {
  backgroundColor: "#0c1d30",
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "#17314f",
  color: "#f8fbff",
  paddingHorizontal: 14,
  paddingVertical: 12,
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
} as const;

const primaryButtonText = {
  color: "#04111f",
  fontWeight: "700",
} as const;

const secondaryButtonText = {
  color: "#f8fbff",
  fontWeight: "600",
} as const;

const sectionTitle = {
  color: "#f8fbff",
  fontSize: 18,
  fontWeight: "700",
} as const;

const fieldLabel = {
  color: "#8fa7c2",
  marginTop: 10,
} as const;

const metaStyle = {
  color: "#8fa7c2",
  marginTop: 4,
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

const warningCardStyle = {
  backgroundColor: "#3a2a12",
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "#6f4c1e",
  padding: 18,
} as const;

const warningTitleStyle = {
  color: "#fff3d6",
  fontSize: 18,
  fontWeight: "700",
} as const;

const warningRowStyle = {
  backgroundColor: "#503617",
  borderRadius: 14,
  padding: 14,
} as const;


