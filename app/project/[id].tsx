import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { addAddonFact, markDoorInstalled, markDoorNotInstalled } from "@/modules/doors/actions";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";
import { buildProjectEarningsContext } from "@/modules/earnings/presentation";
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
  const params = useLocalSearchParams<{
    id: string;
    issueStatus?: string;
    doorSearch?: string;
    doorStatus?: string;
    orderNumber?: string;
    locationCode?: string;
  }>();
  const { id } = params;
  const projectId = id || "";
  const [project, setProject] = useState<ProjectListItem | null>(null);
  const [doors, setDoors] = useState<InstallerDoor[]>([]);
  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [addonTypes, setAddonTypes] = useState<ProjectAddonTypeOption[]>([]);
  const [pendingEvents, setPendingEvents] = useState<PendingSyncEvent[]>([]);
  const [queueSummary, setQueueSummary] = useState<SyncQueueSummary | null>(null);
  const [earningsState, setEarningsState] = useState<InstallerEarningsViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [projectEarningsScope, setProjectEarningsScope] = useState<"TODAY" | "MONTH">("TODAY");
  const [reasons, setReasons] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [comment, setComment] = useState("");
  const [addonTypeId, setAddonTypeId] = useState("");
  const [addonQty, setAddonQty] = useState("1");
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>("ALL");
  const [selectedLocationCode, setSelectedLocationCode] = useState<string>("ALL");
  const [doorSearch, setDoorSearch] = useState("");
  const [doorStatusFilter, setDoorStatusFilter] = useState<string>("ALL");
  const [issueStatusFilter, setIssueStatusFilter] = useState<string>("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!projectId) return;
    const [projectRow, doorRows, issueRows, reasonRows, addonTypeRows, pendingRows, queueSummaryRow, earnings] = await Promise.all([
      getProject(projectId),
      listProjectDoors(projectId),
      listProjectIssues(projectId),
      listReasons(),
      listProjectAddonTypes(projectId),
      listPendingEvents(projectId),
      getSyncQueueSummary(projectId),
      loadInstallerEarnings(),
    ]);
    setProject(projectRow);
    setDoors(doorRows);
    setIssues(issueRows);
    setAddonTypes(addonTypeRows);
    setPendingEvents(pendingRows);
    setQueueSummary(queueSummaryRow);
    setEarningsState(earnings);
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

  useEffect(() => {
    if (typeof params.issueStatus === "string" && params.issueStatus.trim()) {
      setIssueStatusFilter(params.issueStatus.trim().toUpperCase());
    }
    if (typeof params.doorSearch === "string" && params.doorSearch.trim()) {
      setDoorSearch(params.doorSearch.trim());
    }
    if (typeof params.doorStatus === "string" && params.doorStatus.trim()) {
      setDoorStatusFilter(params.doorStatus.trim().toUpperCase());
    }
    if (typeof params.orderNumber === "string" && params.orderNumber.trim()) {
      setSelectedOrderNumber(params.orderNumber.trim());
    }
    if (typeof params.locationCode === "string" && params.locationCode.trim()) {
      setSelectedLocationCode(params.locationCode.trim());
    }
  }, [params.doorSearch, params.doorStatus, params.issueStatus, params.locationCode, params.orderNumber]);

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
      const statusMatch = doorStatusFilter === "ALL" || door.status === doorStatusFilter;
      const searchNeedle = doorSearch.trim().toLowerCase();
      const searchMatch =
        !searchNeedle ||
        [
          door.unit_label,
          door.order_number,
          door.house_number,
          door.floor_label,
          door.apartment_number,
          door.location_code,
          door.door_marking,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchNeedle));
      return orderMatch && locationMatch && statusMatch && searchMatch;
    });
  }, [doorSearch, doorStatusFilter, doors, selectedLocationCode, selectedOrderNumber]);

  const visibleIssues = useMemo(() => {
    return issues.filter((issue) => issueStatusFilter === "ALL" || issue.status === issueStatusFilter);
  }, [issueStatusFilter, issues]);

  const issueDoorIds = useMemo(() => new Set(issues.map((issue) => issue.door_id)), [issues]);
  const problemDoorsCount = useMemo(
    () => doors.filter((door) => issueDoorIds.has(door.id)).length,
    [doors, issueDoorIds]
  );

  const groupedDoors = useMemo(() => {
    return filteredDoors.reduce<Record<string, InstallerDoor[]>>((acc, door) => {
      const key = `${door.floor_label || "No floor"}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(door);
      return acc;
    }, {});
  }, [filteredDoors]);

  const todayDate = new Date().toISOString().slice(0, 10);
  const projectEarnings = useMemo(
    () => buildProjectEarningsContext(earningsState.snapshot, projectId, todayDate),
    [earningsState.snapshot, projectId, todayDate]
  );
  const scopedProjectEarningsRows = useMemo(() => {
    if (!projectEarnings) {
      return [];
    }
    return projectEarningsScope === "TODAY" ? projectEarnings.todayRows : projectEarnings.rows;
  }, [projectEarnings, projectEarningsScope]);
  const scopedProjectEarningsTotal = useMemo(() => {
    if (!projectEarnings) {
      return "--";
    }
    return projectEarningsScope === "TODAY" ? projectEarnings.todayTotal : projectEarnings.monthTotal;
  }, [projectEarnings, projectEarningsScope]);
  const scopedProjectInstallTypes = useMemo(() => {
    const map = new Map<string, { code: string; label: string; amount: number; quantity: number }>();
    for (const row of scopedProjectEarningsRows) {
      const current = map.get(row.install_type_code) || {
        code: row.install_type_code,
        label: row.install_type_label,
        amount: 0,
        quantity: 0,
      };
      current.amount += Number.parseFloat(row.amount) || 0;
      current.quantity += row.quantity;
      map.set(row.install_type_code, current);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [scopedProjectEarningsRows]);

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

  const focusIssueDoor = (issue: ProjectIssue) => {
    const matchingDoor = doors.find((door) => door.id === issue.door_id);
    if (!matchingDoor) {
      return;
    }
    setIssueStatusFilter("OPEN");
    setDoorStatusFilter("ALL");
    setSelectedOrderNumber(matchingDoor.order_number || "ALL");
    setSelectedLocationCode(matchingDoor.location_code || "ALL");
    setDoorSearch(matchingDoor.unit_label);
  };

  const resetDoorFilters = () => {
    setSelectedOrderNumber("ALL");
    setSelectedLocationCode("ALL");
    setDoorSearch("");
    setDoorStatusFilter("ALL");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={{ color: "#f8fbff", fontSize: 22, fontWeight: "700" }}>{project?.name || "Project"}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 6 }}>{project?.address || "No address"}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 6 }}>Open issues: {issues.length}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 2 }}>Problem doors: {problemDoorsCount}</Text>
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

        <View style={cardStyle}>
          <Text style={sectionTitle}>Project action hub</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>Quick links</Text>
              <Text style={summaryValueInlineStyle}>Execution</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => router.push("/calendar" as never)} style={[secondaryButton, { flex: 1 }]}>
                <Text style={secondaryButtonText}>Calendar</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/earnings" as never)} style={[secondaryButton, { flex: 1 }]}>
                <Text style={secondaryButtonText}>Earnings</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => router.push("/sync-queue" as never)} style={[secondaryButton, { flex: 1 }]}>
                <Text style={secondaryButtonText}>Sync queue</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIssueStatusFilter("OPEN");
                  setDoorStatusFilter("ALL");
                }}
                style={[secondaryButton, { flex: 1 }]}
              >
                <Text style={secondaryButtonText}>Open issues</Text>
              </Pressable>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>Project context</Text>
              <Text style={summaryValueInlineStyle}>
                {projectEarnings ? `${projectEarnings.monthTotal} ${projectEarnings.currency}` : "--"}
              </Text>
            </View>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>Project earnings context</Text>
          <Text style={metaStyle}>Source: {earningsState.source}</Text>
          {earningsState.message ? <Text style={[metaStyle, { color: "#ffb86b" }]}>{earningsState.message}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pressable
              onPress={() => setProjectEarningsScope("TODAY")}
              style={[chipStyle, projectEarningsScope === "TODAY" && chipStyleActive]}
            >
              <Text style={{ color: projectEarningsScope === "TODAY" ? "#04111f" : "#d9e7f7" }}>Today</Text>
            </Pressable>
            <Pressable
              onPress={() => setProjectEarningsScope("MONTH")}
              style={[chipStyle, projectEarningsScope === "MONTH" && chipStyleActive]}
            >
              <Text style={{ color: projectEarningsScope === "MONTH" ? "#04111f" : "#d9e7f7" }}>Month</Text>
            </Pressable>
          </View>
          <View style={{ gap: 10, marginTop: 12 }}>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>
                {projectEarningsScope === "TODAY" ? "Today on project" : "Month on project"}
              </Text>
              <Text style={summaryValueInlineStyle}>
                {projectEarnings ? `${scopedProjectEarningsTotal} ${projectEarnings.currency}` : "--"}
              </Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>Rows in scope</Text>
              <Text style={summaryValueInlineStyle}>{scopedProjectEarningsRows.length}</Text>
            </View>
          </View>
          {scopedProjectInstallTypes.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              <Text style={fieldLabel}>By install type</Text>
              {scopedProjectInstallTypes.slice(0, 3).map((item) => (
                <View key={item.code} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{item.label}</Text>
                  <Text style={metaStyle}>Amount: {item.amount.toFixed(2)} {projectEarnings?.currency || ""}</Text>
                  <Text style={metaStyle}>Qty: {item.quantity}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={metaStyle}>No project-scoped earnings rows in the current snapshot.</Text>
          )}
          {scopedProjectEarningsRows.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              <Text style={fieldLabel}>Work rows in scope</Text>
              {scopedProjectEarningsRows.slice(0, 4).map((row) => (
                <View key={row.id} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{row.install_type_label}</Text>
                  <Text style={metaStyle}>Date: {row.work_date}</Text>
                  <Text style={metaStyle}>Door: {row.door_label || "-"}</Text>
                  <Text style={metaStyle}>Amount: {row.amount} {projectEarnings?.currency}</Text>
                </View>
              ))}
            </View>
          ) : null}
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
          <TextInput
            value={doorSearch}
            onChangeText={setDoorSearch}
            placeholder="Search unit / order / location"
            placeholderTextColor="#6b85a4"
            style={[inputStyle, { marginTop: 12 }]}
          />
          <Text style={fieldLabel}>Door status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {["ALL", "NOT_INSTALLED", "INSTALLED", "LOCKED"].map((status) => (
              <Pressable
                key={status}
                onPress={() => setDoorStatusFilter(status)}
                style={[chipStyle, doorStatusFilter === status && chipStyleActive]}
              >
                <Text style={{ color: doorStatusFilter === status ? "#04111f" : "#d9e7f7" }}>
                  {status === "ALL" ? "All doors" : status}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
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
          <Pressable onPress={resetDoorFilters} style={[secondaryButton, { marginTop: 12 }]}>
            <Text style={secondaryButtonText}>Reset door filters</Text>
          </Pressable>
        </View>

        {issues.length ? (
          <View style={warningCardStyle}>
            <Text style={warningTitleStyle}>Open issue queue</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              {["ALL", "OPEN", "CLOSED"].map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setIssueStatusFilter(status)}
                  style={[warningChipStyle, issueStatusFilter === status && warningChipStyleActive]}
                >
                  <Text style={{ color: issueStatusFilter === status ? "#3a2a12" : "#fff3d6" }}>
                    {status === "ALL" ? "All issues" : status}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ gap: 10, marginTop: 10 }}>
              {visibleIssues.map((issue) => (
                <View key={issue.id} style={warningRowStyle}>
                  <Text style={{ color: "#fff3d6", fontWeight: "700" }}>{issue.title || "Issue"}</Text>
                  <Text style={{ color: "#f2cf8b", marginTop: 4 }}>Status: {issue.status}</Text>
                  <Text style={{ color: "#f2cf8b", marginTop: 4 }}>{issue.details || "Requires installer attention"}</Text>
                  <Pressable onPress={() => focusIssueDoor(issue)} style={[secondaryButton, { marginTop: 10 }]}>
                    <Text style={secondaryButtonText}>Only this door</Text>
                  </Pressable>
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

const summaryRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const summaryLabelStyle = {
  color: "#8fa7c2",
} as const;

const summaryValueInlineStyle = {
  color: "#f8fbff",
  fontWeight: "700",
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

const warningChipStyle = {
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "#8a6429",
  backgroundColor: "#503617",
} as const;

const warningChipStyleActive = {
  backgroundColor: "#f2cf8b",
  borderColor: "#f2cf8b",
} as const;


