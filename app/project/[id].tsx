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
import { useI18n } from "@/providers/AppProviders";

export default function ProjectDetailsScreen() {
  const { t, isRTL } = useI18n();
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
  const [issueDoorFocus, setIssueDoorFocus] = useState(false);
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
  const issueDoorIds = useMemo(() => new Set(issues.map((issue) => issue.door_id)), [issues]);

  const filteredDoors = useMemo(() => {
    return doors.filter((door) => {
      const orderMatch = selectedOrderNumber === "ALL" || door.order_number === selectedOrderNumber;
      const locationMatch = selectedLocationCode === "ALL" || door.location_code === selectedLocationCode;
      const statusMatch = doorStatusFilter === "ALL" || door.status === doorStatusFilter;
      const issueDoorMatch = !issueDoorFocus || issueDoorIds.has(door.id);
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
      return orderMatch && locationMatch && statusMatch && issueDoorMatch && searchMatch;
    });
  }, [doorSearch, doorStatusFilter, doors, issueDoorFocus, issueDoorIds, selectedLocationCode, selectedOrderNumber]);

  const visibleIssues = useMemo(() => {
    return issues.filter((issue) => issueStatusFilter === "ALL" || issue.status === issueStatusFilter);
  }, [issueStatusFilter, issues]);
  const problemDoorsCount = useMemo(
    () => doors.filter((door) => issueDoorIds.has(door.id)).length,
    [doors, issueDoorIds]
  );
  const priorityDoors = useMemo(() => {
    const withIssues = doors.filter((door) => issueDoorIds.has(door.id));
    const notInstalled = doors.filter((door) => door.status === "NOT_INSTALLED" && !issueDoorIds.has(door.id));
    return [...withIssues, ...notInstalled].slice(0, 5);
  }, [doors, issueDoorIds]);

  const groupedDoors = useMemo(() => {
    return filteredDoors.reduce<Record<string, InstallerDoor[]>>((acc, door) => {
      const key = `${door.floor_label || "No floor"}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(door);
      return acc;
    }, {});
  }, [filteredDoors]);
  const floorLaneSummary = useMemo(() => {
    return Object.entries(groupedDoors)
      .map(([floor, floorDoors]) => {
        const issueCount = floorDoors.filter((door) => issueDoorIds.has(door.id)).length;
        const notInstalledCount = floorDoors.filter((door) => door.status === "NOT_INSTALLED").length;
        return {
          floor,
          doorsCount: floorDoors.length,
          issueCount,
          notInstalledCount,
          firstDoor: floorDoors[0] || null,
        };
      })
      .sort((a, b) => {
        if (b.issueCount !== a.issueCount) return b.issueCount - a.issueCount;
        if (b.notInstalledCount !== a.notInstalledCount) return b.notInstalledCount - a.notInstalledCount;
        return a.floor.localeCompare(b.floor);
      });
  }, [groupedDoors, issueDoorIds]);
  const issueSummary = useMemo(() => {
    const open = issues.filter((issue) => issue.status === "OPEN").length;
    const closed = issues.filter((issue) => issue.status === "CLOSED").length;
    return {
      all: issues.length,
      open,
      closed,
      issueDoors: problemDoorsCount,
    };
  }, [issues, problemDoorsCount]);
  const completionSummary = useMemo(() => {
    const installed = doors.filter((door) => door.status === "INSTALLED").length;
    const notInstalled = doors.filter((door) => door.status === "NOT_INSTALLED").length;
    const locked = doors.filter((door) => door.is_locked || door.status === "LOCKED").length;
    return {
      installed,
      notInstalled,
      locked,
      issueDoors: problemDoorsCount,
      total: doors.length,
    };
  }, [doors, problemDoorsCount]);

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
    setIssueDoorFocus(true);
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
    setIssueDoorFocus(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f" }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={cardStyle}>
          <Text style={{ color: "#f8fbff", fontSize: 22, fontWeight: "700", textAlign: isRTL ? "right" : "left" }}>{project?.name || t("title.project")}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 6, textAlign: isRTL ? "right" : "left" }}>{project?.address || t("project.noAddress")}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 6 }}>{t("project.openIssues")}: {issues.length}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 2 }}>{t("project.problemDoors")}: {problemDoorsCount}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 2 }}>{t("project.doors")}: {doors.length}</Text>
          <Text style={{ color: "#8fa7c2", marginTop: 2 }}>{t("project.visibleAfterFilters")}: {filteredDoors.length}</Text>
          <Text style={{ color: pendingEvents.length > 0 ? "#ffb86b" : "#63d297", marginTop: 2 }}>
            {t("project.pendingProjectEvents")}: {pendingEvents.length}
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
          <Text style={sectionTitle}>{t("project.completionLane")}</Text>
          <Text style={metaStyle}>{t("project.executionStatus")}</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{t("common.installed")}</Text>
              <Text style={summaryValueInlineStyle}>{completionSummary.installed}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{t("common.notInstalled")}</Text>
              <Text style={summaryValueInlineStyle}>{completionSummary.notInstalled}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{t("project.issueDoors")}</Text>
              <Text style={summaryValueInlineStyle}>{completionSummary.issueDoors}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{t("common.locked")}</Text>
              <Text style={summaryValueInlineStyle}>{completionSummary.locked}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{t("project.totalDoors")}</Text>
              <Text style={summaryValueInlineStyle}>{completionSummary.total}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => {
                setDoorStatusFilter("NOT_INSTALLED");
                setIssueDoorFocus(false);
              }}
              style={[secondaryButton, { flex: 1 }]}
            >
              <Text style={secondaryButtonText}>{t("project.notInstalledLane")}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIssueStatusFilter("OPEN");
                setIssueDoorFocus(true);
                setDoorStatusFilter("ALL");
              }}
              style={[secondaryButton, { flex: 1 }]}
            >
              <Text style={secondaryButtonText}>{t("project.issueLane")}</Text>
            </Pressable>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("project.actionHub")}</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{t("project.quickLinks")}</Text>
              <Text style={summaryValueInlineStyle}>{t("project.execution")}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => router.push("/calendar" as never)} style={[secondaryButton, { flex: 1 }]}>
                <Text style={secondaryButtonText}>{t("title.calendar")}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/earnings" as never)} style={[secondaryButton, { flex: 1 }]}>
                <Text style={secondaryButtonText}>{t("title.earnings")}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => router.push("/sync-queue" as never)} style={[secondaryButton, { flex: 1 }]}>
                <Text style={secondaryButtonText}>{t("project.syncQueue")}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIssueStatusFilter("OPEN");
                  setDoorStatusFilter("ALL");
                }}
                style={[secondaryButton, { flex: 1 }]}
              >
                <Text style={secondaryButtonText}>{t("calendar.openIssues")}</Text>
              </Pressable>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{t("project.projectContext")}</Text>
              <Text style={summaryValueInlineStyle}>
                {projectEarnings ? `${projectEarnings.monthTotal} ${projectEarnings.currency}` : "--"}
              </Text>
            </View>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("project.earningsContext")}</Text>
          <Text style={metaStyle}>{t("common.source")}: {earningsState.source}</Text>
          {earningsState.message ? <Text style={[metaStyle, { color: "#ffb86b" }]}>{earningsState.message}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pressable
              onPress={() => setProjectEarningsScope("TODAY")}
              style={[chipStyle, projectEarningsScope === "TODAY" && chipStyleActive]}
            >
              <Text style={{ color: projectEarningsScope === "TODAY" ? "#04111f" : "#d9e7f7" }}>{t("common.today")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setProjectEarningsScope("MONTH")}
              style={[chipStyle, projectEarningsScope === "MONTH" && chipStyleActive]}
            >
              <Text style={{ color: projectEarningsScope === "MONTH" ? "#04111f" : "#d9e7f7" }}>{t("common.month")}</Text>
            </Pressable>
          </View>
          <View style={{ gap: 10, marginTop: 12 }}>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>
                {projectEarningsScope === "TODAY" ? t("project.todayOnProject") : t("project.monthOnProject")}
              </Text>
              <Text style={summaryValueInlineStyle}>
                {projectEarnings ? `${scopedProjectEarningsTotal} ${projectEarnings.currency}` : "--"}
              </Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{t("earnings.rowsInFocus")}</Text>
              <Text style={summaryValueInlineStyle}>{scopedProjectEarningsRows.length}</Text>
            </View>
          </View>
          {scopedProjectInstallTypes.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              <Text style={fieldLabel}>{t("project.byInstallType")}</Text>
              {scopedProjectInstallTypes.slice(0, 3).map((item) => (
                <View key={item.code} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{item.label}</Text>
                  <Text style={metaStyle}>{t("common.amount")}: {item.amount.toFixed(2)} {projectEarnings?.currency || ""}</Text>
                  <Text style={metaStyle}>{t("common.quantity")}: {item.quantity}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={metaStyle}>{t("earnings.noRows")}</Text>
          )}
          {scopedProjectEarningsRows.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              <Text style={fieldLabel}>{t("project.workRows")}</Text>
              {scopedProjectEarningsRows.slice(0, 4).map((row) => (
                <View key={row.id} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{row.install_type_label}</Text>
                  <Text style={metaStyle}>{t("common.date")}: {row.work_date}</Text>
                  <Text style={metaStyle}>{t("earnings.door")}: {row.door_label || "-"}</Text>
                  <Text style={metaStyle}>{t("common.amount")}: {row.amount} {projectEarnings?.currency}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <Pressable onPress={handleSync} style={secondaryButton}>
          <Text style={secondaryButtonText}>{busy ? t("common.working") : t("project.syncQueuedWork")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/sync-queue" as never)} style={secondaryButton}>
          <Text style={secondaryButtonText}>{t("project.openSyncQueue")}</Text>
        </Pressable>

        {error ? <Text style={{ color: "#ff8b8b" }}>{error}</Text> : null}

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("project.doorFilters")}</Text>
          <TextInput
            value={doorSearch}
            onChangeText={setDoorSearch}
            placeholder={t("project.searchDoor")}
            placeholderTextColor="#6b85a4"
            style={[inputStyle, { marginTop: 12 }]}
          />
          <Text style={fieldLabel}>{t("project.doorStatus")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {["ALL", "NOT_INSTALLED", "INSTALLED", "LOCKED"].map((status) => (
              <Pressable
                key={status}
                onPress={() => setDoorStatusFilter(status)}
                style={[chipStyle, doorStatusFilter === status && chipStyleActive]}
              >
                <Text style={{ color: doorStatusFilter === status ? "#04111f" : "#d9e7f7" }}>
                  {status === "ALL" ? t("project.allDoors") : status}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={fieldLabel}>{t("project.orderNumber")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            <Pressable onPress={() => setSelectedOrderNumber("ALL")} style={[chipStyle, selectedOrderNumber === "ALL" && chipStyleActive]}>
              <Text style={{ color: selectedOrderNumber === "ALL" ? "#04111f" : "#d9e7f7" }}>{t("project.allOrders")}</Text>
            </Pressable>
            {orderNumbers.map((orderNumber) => (
              <Pressable key={orderNumber} onPress={() => setSelectedOrderNumber(orderNumber)} style={[chipStyle, selectedOrderNumber === orderNumber && chipStyleActive]}>
                <Text style={{ color: selectedOrderNumber === orderNumber ? "#04111f" : "#d9e7f7" }}>{orderNumber}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={fieldLabel}>{t("project.locationCode")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            <Pressable onPress={() => setSelectedLocationCode("ALL")} style={[chipStyle, selectedLocationCode === "ALL" && chipStyleActive]}>
              <Text style={{ color: selectedLocationCode === "ALL" ? "#04111f" : "#d9e7f7" }}>{t("project.allLocations")}</Text>
            </Pressable>
            {locationCodes.map((locationCode) => (
              <Pressable key={locationCode} onPress={() => setSelectedLocationCode(locationCode)} style={[chipStyle, selectedLocationCode === locationCode && chipStyleActive]}>
                <Text style={{ color: selectedLocationCode === locationCode ? "#04111f" : "#d9e7f7" }}>{locationCode}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={resetDoorFilters} style={[secondaryButton, { marginTop: 12 }]}>
            <Text style={secondaryButtonText}>{t("project.resetDoorFilters")}</Text>
          </Pressable>
        </View>

        {issues.length ? (
          <View style={warningCardStyle}>
            <Text style={warningTitleStyle}>{t("project.openIssueQueue")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              <Pressable
                onPress={() => {
                  setIssueStatusFilter("ALL");
                  setIssueDoorFocus(false);
                }}
                style={[warningChipStyle, issueStatusFilter === "ALL" && !issueDoorFocus && warningChipStyleActive]}
              >
                <Text style={{ color: issueStatusFilter === "ALL" && !issueDoorFocus ? "#3a2a12" : "#fff3d6" }}>
                  {t("common.all")} ({issueSummary.all})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIssueStatusFilter("OPEN");
                  setIssueDoorFocus(false);
                }}
                style={[warningChipStyle, issueStatusFilter === "OPEN" && !issueDoorFocus && warningChipStyleActive]}
              >
                <Text style={{ color: issueStatusFilter === "OPEN" && !issueDoorFocus ? "#3a2a12" : "#fff3d6" }}>
                  {t("common.open")} ({issueSummary.open})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIssueStatusFilter("CLOSED");
                  setIssueDoorFocus(false);
                }}
                style={[warningChipStyle, issueStatusFilter === "CLOSED" && !issueDoorFocus && warningChipStyleActive]}
              >
                <Text style={{ color: issueStatusFilter === "CLOSED" && !issueDoorFocus ? "#3a2a12" : "#fff3d6" }}>
                  {t("common.closed")} ({issueSummary.closed})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIssueStatusFilter("OPEN");
                  setIssueDoorFocus(true);
                }}
                style={[warningChipStyle, issueDoorFocus && warningChipStyleActive]}
              >
                <Text style={{ color: issueDoorFocus ? "#3a2a12" : "#fff3d6" }}>
                  {t("project.issueDoors")} ({issueSummary.issueDoors})
                </Text>
              </Pressable>
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              {["ALL", "OPEN", "CLOSED"].map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setIssueStatusFilter(status)}
                  style={[warningChipStyle, issueStatusFilter === status && warningChipStyleActive]}
                >
                  <Text style={{ color: issueStatusFilter === status ? "#3a2a12" : "#fff3d6" }}>
                    {status === "ALL" ? t("project.allIssues") : status}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ gap: 10, marginTop: 10 }}>
              {visibleIssues.map((issue) => (
                <View key={issue.id} style={warningRowStyle}>
                  <Text style={{ color: "#fff3d6", fontWeight: "700" }}>{issue.title || t("project.openIssues")}</Text>
                  <Text style={{ color: "#f2cf8b", marginTop: 4 }}>{t("common.status")}: {issue.status}</Text>
                  <Text style={{ color: "#f2cf8b", marginTop: 4 }}>{issue.details || t("project.requiresAttention")}</Text>
                  <Pressable onPress={() => focusIssueDoor(issue)} style={[secondaryButton, { marginTop: 10 }]}>
                    <Text style={secondaryButtonText}>{t("project.onlyThisDoor")}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {priorityDoors.length ? (
          <View style={cardStyle}>
            <Text style={sectionTitle}>{t("project.priorityDoors")}</Text>
            <Text style={metaStyle}>{t("project.prioritySubtitle")}</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {priorityDoors.map((door) => (
                <View key={door.id} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{door.unit_label}</Text>
                  <Text style={metaStyle}>{t("common.status")}: {door.status}</Text>
                  <Text style={metaStyle}>{t("project.order")}: {door.order_number || "-"}</Text>
                  <Text style={metaStyle}>{t("common.location")}: {door.location_code || "-"}</Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable
                      onPress={() => {
                        setDoorSearch(door.unit_label);
                        setDoorStatusFilter("ALL");
                        setSelectedOrderNumber(door.order_number || "ALL");
                        setSelectedLocationCode(door.location_code || "ALL");
                      }}
                      style={[secondaryButton, { flex: 1 }]}
                    >
                      <Text style={secondaryButtonText}>{t("project.onlyThisDoor")}</Text>
                    </Pressable>
                    {issueDoorIds.has(door.id) ? (
                      <Pressable
                        onPress={() => {
                          setIssueStatusFilter("OPEN");
                          setDoorSearch(door.unit_label);
                          setDoorStatusFilter("ALL");
                        }}
                        style={[secondaryButton, { flex: 1 }]}
                      >
                        <Text style={secondaryButtonText}>{t("project.issueFocus")}</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => handleInstall(door.id)}
                        style={[primaryButton, { flex: 1 }]}
                        disabled={busy || door.is_locked}
                      >
                        <Text style={primaryButtonText}>{t("common.installed")}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {floorLaneSummary.length ? (
          <View style={cardStyle}>
            <Text style={sectionTitle}>{t("project.floorLanes")}</Text>
            <Text style={metaStyle}>{t("project.floorSubtitle")}</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {floorLaneSummary.map((lane) => (
                <View key={lane.floor} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{t("project.floor")} {lane.floor}</Text>
                  <Text style={metaStyle}>{t("project.doors")}: {lane.doorsCount}</Text>
                  <Text style={metaStyle}>{t("project.issueDoors")}: {lane.issueCount}</Text>
                  <Text style={metaStyle}>{t("common.notInstalled")}: {lane.notInstalledCount}</Text>
                  {lane.firstDoor ? (
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                      <Pressable
                        onPress={() => {
                          setDoorSearch(lane.firstDoor?.unit_label || "");
                          setSelectedOrderNumber(lane.firstDoor?.order_number || "ALL");
                          setSelectedLocationCode(lane.firstDoor?.location_code || "ALL");
                          setDoorStatusFilter("ALL");
                        }}
                        style={[secondaryButton, { flex: 1 }]}
                      >
                        <Text style={secondaryButtonText}>{t("project.openFloorLane")}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setDoorSearch("");
                          setSelectedOrderNumber("ALL");
                          setSelectedLocationCode("ALL");
                          setDoorStatusFilter("ALL");
                          setIssueDoorFocus(lane.issueCount > 0);
                        }}
                        style={[secondaryButton, { flex: 1 }]}
                      >
                        <Text style={secondaryButtonText}>{lane.issueCount > 0 ? t("project.issueDoors") : t("project.viewFloor")}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={cardStyle}>
          <Text style={sectionTitle}>{t("project.offlineActions")}</Text>
          <Text style={fieldLabel}>{t("project.reasonNotInstalled")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {reasons.map((reason) => (
              <Pressable key={reason.id} onPress={() => setSelectedReasonId(reason.id)} style={[chipStyle, selectedReasonId === reason.id && chipStyleActive]}>
                <Text style={{ color: selectedReasonId === reason.id ? "#04111f" : "#d9e7f7" }}>{reason.code}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput value={comment} onChangeText={setComment} placeholder={t("project.comment")} placeholderTextColor="#6b85a4" multiline style={[inputStyle, { marginTop: 12, minHeight: 90 }]} />
          <Text style={fieldLabel}>{t("project.addonType")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {addonTypes.map((addon) => (
              <Pressable key={addon.id} onPress={() => setAddonTypeId(addon.id)} style={[chipStyle, addonTypeId === addon.id && chipStyleActive]}>
                <Text style={{ color: addonTypeId === addon.id ? "#04111f" : "#d9e7f7" }}>
                  {addon.name}{addon.qty_planned ? ` | ${addon.qty_planned} ${addon.unit}` : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput value={addonQty} onChangeText={setAddonQty} placeholder={t("project.qtyDone")} placeholderTextColor="#6b85a4" style={[inputStyle, { marginTop: 12 }]} keyboardType="numeric" />
          <Pressable onPress={handleAddonFact} style={[primaryButton, { marginTop: 12 }]}>
            <Text style={primaryButtonText}>{t("project.queueAddonFact")}</Text>
          </Pressable>
        </View>

        {pendingEvents.length ? (
          <View style={cardStyle}>
            <Text style={sectionTitle}>{t("project.pendingSyncQueue")}</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {pendingEvents.map((event) => (
                <View key={event.client_event_id} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{event.type}</Text>
                  <Text style={metaStyle}>{t("project.queued")}: {event.created_at}</Text>
                  <Text style={metaStyle}>{t("common.status")}: {event.status}</Text>
                  <Text style={metaStyle}>{t("project.attempts")}: {event.attempts}</Text>
                  {event.last_attempt_at ? <Text style={metaStyle}>{t("project.lastAttempt")}: {event.last_attempt_at}</Text> : null}
                  {event.next_retry_at ? <Text style={metaStyle}>{t("project.nextRetry")}: {event.next_retry_at}</Text> : null}
                  {event.error ? <Text style={{ color: "#ff8b8b", marginTop: 4 }}>{event.error}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {Object.entries(groupedDoors).map(([floor, floorDoors]) => (
          <View key={floor} style={cardStyle}>
            <Text style={sectionTitle}>{t("project.floor")} {floor}</Text>
            <View style={{ gap: 12, marginTop: 12 }}>
              {floorDoors.map((door) => (
                <View key={door.id} style={doorCardStyle}>
                  <Text style={{ color: "#f8fbff", fontWeight: "700" }}>{door.unit_label}</Text>
                  <Text style={metaStyle}>{t("project.order")}: {door.order_number || "-"}</Text>
                  <Text style={metaStyle}>{t("project.house")}: {door.house_number || "-"}</Text>
                  <Text style={metaStyle}>{t("project.floor")}: {door.floor_label || "-"}</Text>
                  <Text style={metaStyle}>{t("project.apartment")}: {door.apartment_number || "-"}</Text>
                  <Text style={metaStyle}>{t("common.location")}: {door.location_code || "-"}</Text>
                  <Text style={metaStyle}>{t("project.marking")}: {door.door_marking || "-"}</Text>
                  <Text style={[metaStyle, { color: door.status === "INSTALLED" ? "#63d297" : "#ffb86b" }]}>{door.status}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <Pressable onPress={() => handleInstall(door.id)} style={[primaryButton, { flex: 1 }]} disabled={busy || door.is_locked}>
                      <Text style={primaryButtonText}>{t("common.installed")}</Text>
                    </Pressable>
                    <Pressable onPress={() => handleNotInstalled(door.id)} style={[secondaryButton, { flex: 1 }]} disabled={busy}>
                      <Text style={secondaryButtonText}>{t("common.notInstalled")}</Text>
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


