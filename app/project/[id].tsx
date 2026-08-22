import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import {
  ActionButton,
  BrandText as Text,
  EmptyState,
  IconButton,
  MetricTile,
  ScreenHero,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { currentLocalDateKey } from "@/lib/date-key";
import { NetworkError } from "@/lib/errors";
import { translateEnum } from "@/lib/i18n";
import { installerTheme, toneColors, type InstallerTone } from "@/lib/theme";
import { addAddonFact, markDoorInstalled, markDoorNotInstalled } from "@/modules/doors/actions";
import { buildProjectEarningsContext } from "@/modules/earnings/presentation";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";
import {
  buildProjectExternalActions,
  openProjectExternalAction,
  type ProjectExternalAction,
} from "@/modules/projects/external-actions";
import { buildAddonFactActionState, buildDoorActionState } from "@/modules/projects/door-action-state";
import {
  createEmptyLocalProjectWorkspace,
  loadLocalProjectWorkspace,
  type LocalProjectWorkspace,
} from "@/modules/projects/local-workspace";
import {
  canRefreshProjectDetails,
  isProjectAccessRevoked,
  refreshProjectDetails,
} from "@/modules/projects/service";
import type { InstallerDoor } from "@/modules/projects/types";
import { runSync } from "@/modules/sync/service";
import { useI18n } from "@/providers/AppProviders";

type IssueFilter = "OPEN" | "ALL";
const EMPTY_LOCAL_PROJECT_WORKSPACE = createEmptyLocalProjectWorkspace();

export default function ProjectDetailsScreen() {
  const { locale } = useI18n();
  const params = useLocalSearchParams<{
    id: string;
    issueStatus?: string;
    doorSearch?: string;
    doorStatus?: string;
    orderNumber?: string;
    locationCode?: string;
  }>();
  const projectId = typeof params.id === "string" ? params.id : "";
  const activeProjectId = useRef(projectId);
  activeProjectId.current = projectId;
  const localLoadRevision = useRef(0);
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";

  const [localWorkspace, setLocalWorkspace] = useState<LocalProjectWorkspace | null>(null);
  const activeWorkspace =
    localWorkspace?.projectId === projectId
      ? localWorkspace
      : EMPTY_LOCAL_PROJECT_WORKSPACE;
  const {
    project,
    doors,
    doorTypes,
    issues,
    reasons,
    addonTypes,
    addonFacts,
    pendingEvents,
    queueSummary,
  } = activeWorkspace;
  const [earningsState, setEarningsState] = useState<InstallerEarningsViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [selectedDoorId, setSelectedDoorId] = useState("");
  const [doorSearch, setDoorSearch] = useState("");
  const [doorStatusFilter, setDoorStatusFilter] = useState("ALL");
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("ALL");
  const [selectedLocationCode, setSelectedLocationCode] = useState("ALL");
  const [focusedFloor, setFocusedFloor] = useState("ALL");
  const autoFocusedProjectId = useRef("");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("OPEN");
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [doorComment, setDoorComment] = useState("");
  const [showNotInstalledForm, setShowNotInstalledForm] = useState(false);
  const [addonTypeId, setAddonTypeId] = useState("");
  const [addonQty, setAddonQty] = useState("1");
  const [addonComment, setAddonComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocalProjectDetails = async () => {
    const requestedProjectId = projectId;
    const revision = ++localLoadRevision.current;
    const workspace = await loadLocalProjectWorkspace(requestedProjectId);
    const pendingEventCount =
      (workspace.queueSummary?.pending || 0) + (workspace.queueSummary?.failed || 0);
    if (
      activeProjectId.current !== requestedProjectId ||
      localLoadRevision.current !== revision
    ) {
      return pendingEventCount;
    }

    setLocalWorkspace(workspace);
    setSelectedReasonId((current) =>
      workspace.reasons.some((reason) => reason.id === current) ? current : workspace.reasons[0]?.id || ""
    );
    setAddonTypeId((current) =>
      workspace.addonTypes.some((addon) => addon.id === current) ? current : workspace.addonTypes[0]?.id || ""
    );
    setSelectedDoorId((current) => {
      if (workspace.doors.some((door) => door.id === current)) return current;
      const search = typeof params.doorSearch === "string" ? params.doorSearch.trim().toLowerCase() : "";
      const matched = search
        ? workspace.doors.find((door) => door.unit_label.toLowerCase().includes(search))
        : null;
      return matched?.id || workspace.issues[0]?.door_id || workspace.doors[0]?.id || "";
    });

    return pendingEventCount;
  };

  const reload = async ({ refreshRemote = true }: { refreshRemote?: boolean } = {}) => {
    if (!projectId) return;

    const pendingEventCount = await loadLocalProjectDetails();
    if (!refreshRemote) return;

    const earningsPromise = loadInstallerEarnings("month", currentLocalDateKey());
    let refreshed = false;
    if (canRefreshProjectDetails(pendingEventCount)) {
      try {
        await refreshProjectDetails(projectId);
        refreshed = true;
      } catch (reason) {
        if (isProjectAccessRevoked(reason)) {
          try {
            await runSync({ forceRetry: true });
            await loadLocalProjectDetails();
          } catch {
            // The confirmed access response still requires hiding stale in-memory data.
          }
          if (activeProjectId.current === projectId) {
            setLocalWorkspace(createEmptyLocalProjectWorkspace(projectId));
          }
          throw new Error(
            lt(
              "This project is no longer assigned to you.",
              "Этот проект больше вам не назначен.",
              "הפרויקט הזה כבר לא משויך אליך."
            )
          );
        }
        if (!(reason instanceof NetworkError)) {
          throw reason;
        }
        // Network failures keep the assigned project usable from the offline cache.
      }
    }

    setEarningsState(await earningsPromise);
    if (refreshed) {
      await loadLocalProjectDetails();
    }
  };

  useEffect(() => {
    void reload().catch((reason) => {
      setError(reason instanceof Error ? reason.message : lt("Unable to load project", "Не удалось загрузить проект", "לא ניתן לטעון את הפרויקט"));
    });
  }, [projectId]);

  useEffect(() => {
    if (typeof params.doorSearch === "string") setDoorSearch(params.doorSearch.trim());
    if (typeof params.doorStatus === "string" && params.doorStatus.trim()) {
      setDoorStatusFilter(params.doorStatus.trim().toUpperCase());
    }
    if (typeof params.orderNumber === "string" && params.orderNumber.trim()) {
      setSelectedOrderNumber(params.orderNumber.trim());
    }
    if (typeof params.locationCode === "string" && params.locationCode.trim()) {
      setSelectedLocationCode(params.locationCode.trim());
    }
    if (params.issueStatus === "OPEN") setIssueFilter("OPEN");
  }, [params.doorSearch, params.doorStatus, params.issueStatus, params.locationCode, params.orderNumber]);

  const issueDoorIds = useMemo(() => new Set(issues.map((issue) => issue.door_id)), [issues]);
  const selectedDoor = doors.find((door) => door.id === selectedDoorId) || null;
  const selectedDoorIssues = issues.filter((issue) => issue.door_id === selectedDoorId);
  const selectedDoorPendingEvents = pendingEvents.filter(
    (event) => event.payload.door_id === selectedDoorId
  );
  const selectedDoorType = selectedDoor
    ? doorTypes.find((doorType) => doorType.id === selectedDoor.door_type_id) || null
    : null;
  const selectedReason = reasons.find((reason) => reason.id === selectedReasonId) || null;
  const hasPendingDoorStatus = selectedDoorPendingEvents.some(
    (event) => event.type === "DOOR_SET_STATUS"
  );
  const doorActionState = selectedDoor
    ? buildDoorActionState({
        door: selectedDoor,
        busy,
        selectedReasonId,
        hasPendingStatusEvent: hasPendingDoorStatus,
      })
    : null;

  useEffect(() => {
    setDoorComment("");
    setShowNotInstalledForm(false);
  }, [selectedDoorId]);
  const orderNumbers = useMemo(
    () => Array.from(new Set(doors.map((door) => door.order_number).filter(Boolean) as string[])).sort(),
    [doors]
  );
  const locationCodes = useMemo(
    () => Array.from(new Set(doors.map((door) => door.location_code).filter(Boolean) as string[])).sort(),
    [doors]
  );
  const filteredDoors = useMemo(() => {
    const needle = doorSearch.trim().toLowerCase();
    return doors.filter((door) => {
      const searchMatch =
        !needle ||
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
          .some((value) => String(value).toLowerCase().includes(needle));
      const statusMatch =
        doorStatusFilter === "ALL" ||
        (doorStatusFilter === "ISSUES" ? issueDoorIds.has(door.id) : door.status === doorStatusFilter);
      return (
        searchMatch &&
        statusMatch &&
        (selectedOrderNumber === "ALL" || door.order_number === selectedOrderNumber) &&
        (selectedLocationCode === "ALL" || door.location_code === selectedLocationCode)
      );
    });
  }, [doorSearch, doorStatusFilter, doors, issueDoorIds, selectedLocationCode, selectedOrderNumber]);
  const groupedDoors = useMemo(() => {
    const groups = new Map<string, InstallerDoor[]>();
    for (const door of filteredDoors) {
      const floor = door.floor_label || lt("No floor", "Без этажа", "ללא קומה");
      groups.set(floor, [...(groups.get(floor) || []), door]);
    }
    return Array.from(groups.entries()).sort(([left], [right]) =>
      left.localeCompare(right, intlLocale, { numeric: true })
    );
  }, [filteredDoors, intlLocale]);
  const displayedFloorGroups = useMemo(
    () => focusedFloor === "ALL" ? groupedDoors : groupedDoors.filter(([floor]) => floor === focusedFloor),
    [focusedFloor, groupedDoors]
  );

  useEffect(() => {
    if (focusedFloor !== "ALL" && !groupedDoors.some(([floor]) => floor === focusedFloor)) {
      setFocusedFloor("ALL");
    }
  }, [focusedFloor, groupedDoors]);

  useEffect(() => {
    if (
      autoFocusedProjectId.current !== projectId &&
      focusedFloor === "ALL" &&
      selectedDoor?.floor_label &&
      groupedDoors.length
    ) {
      setFocusedFloor(selectedDoor.floor_label);
      autoFocusedProjectId.current = projectId;
    }
  }, [focusedFloor, groupedDoors.length, projectId, selectedDoor?.floor_label]);
  const visibleIssues = issues.filter((issue) => issueFilter === "ALL" || issue.status !== "CLOSED");
  const completion = useMemo(() => {
    const installed = doors.filter((door) => door.status === "INSTALLED").length;
    const notInstalled = doors.filter((door) => door.status === "NOT_INSTALLED").length;
    const locked = doors.filter((door) => door.is_locked || door.status === "LOCKED").length;
    const problem = doors.filter((door) => issueDoorIds.has(door.id)).length;
    const total = doors.length;
    return {
      installed,
      notInstalled,
      locked,
      problem,
      total,
      percent: total ? Math.round((installed / total) * 100) : 0,
    };
  }, [doors, issueDoorIds]);
  const projectEarnings = useMemo(
    () => buildProjectEarningsContext(earningsState.snapshot, projectId, currentLocalDateKey()),
    [earningsState.snapshot, projectId]
  );
  const externalActions = useMemo(() => buildProjectExternalActions(project), [project]);
  const addonActionState = useMemo(
    () =>
      buildAddonFactActionState({
        addonTypes,
        selectedAddonTypeId: addonTypeId,
        qtyDone: addonQty,
        busy,
      }),
    [addonQty, addonTypeId, addonTypes, busy]
  );

  const handleInstall = async () => {
    if (!selectedDoor) return;
    setBusy(true);
    setError(null);
    try {
      await markDoorInstalled(projectId, selectedDoor.id);
      await reload({ refreshRemote: false });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Door update failed", "Не удалось обновить дверь", "עדכון הדלת נכשל"));
    } finally {
      setBusy(false);
    }
  };

  const handleNotInstalled = async () => {
    if (!selectedDoor || !selectedReasonId) return;
    setBusy(true);
    setError(null);
    try {
      await markDoorNotInstalled(projectId, selectedDoor.id, selectedReasonId, doorComment);
      setDoorComment("");
      setShowNotInstalledForm(false);
      await reload({ refreshRemote: false });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Door update failed", "Не удалось обновить дверь", "עדכון הדלת נכשל"));
    } finally {
      setBusy(false);
    }
  };

  const handleAddonFact = async () => {
    if (!addonActionState.canQueueAddonFact || !addonActionState.normalizedQtyDone) return;
    setBusy(true);
    setError(null);
    try {
      await addAddonFact(projectId, addonTypeId, addonActionState.normalizedQtyDone, addonComment);
      setAddonQty("1");
      setAddonComment("");
      await reload({ refreshRemote: false });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Unable to save add-on", "Не удалось сохранить допработу", "שמירת העבודה הנוספת נכשלה"));
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Sync failed", "Синхронизация не выполнена", "הסנכרון נכשל"));
    } finally {
      setBusy(false);
    }
  };

  const openExternal = async (action: ProjectExternalAction) => {
    setError(null);
    try {
      await openProjectExternalAction(action);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Unable to open action", "Не удалось открыть действие", "לא ניתן לפתוח את הפעולה"));
    }
  };

  const resetFilters = () => {
    setDoorSearch("");
    setDoorStatusFilter("ALL");
    setSelectedOrderNumber("ALL");
    setSelectedLocationCode("ALL");
    setFocusedFloor("ALL");
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "—";
    return new Intl.DateTimeFormat(intlLocale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          showMark={false}
          eyebrow={`${lt("JOB", "ОБЪЕКТ", "פרויקט")} · ${projectId.slice(0, 8)}`}
          title={project?.name || lt("Project", "Объект", "פרויקט")}
          subtitle={project?.address || lt("No address", "Адрес не указан", "לא הוגדרה כתובת")}
          right={
            <View style={styles.heroActions}>
              <IconButton icon="arrow-back" label={lt("Back", "Назад", "חזרה")} tone="dark" onPress={() => router.back()} />
              <IconButton icon="sync" label={lt("Sync now", "Синхронизировать", "סנכרון")} tone="dark" disabled={busy} onPress={() => void handleSync()} />
            </View>
          }
        >
          <View style={styles.heroBadges}>
            <StatusPill label={translateEnum(locale, project?.status || "ACTIVE")} tone="accent" />
            <StatusPill
              label={`${pendingEvents.length} ${lt("queued", "в очереди", "בתור")}`}
              tone={queueSummary?.blocked ? "danger" : pendingEvents.length ? "warning" : "success"}
              icon={pendingEvents.length ? "cloud-upload-outline" : "cloud-done-outline"}
            />
          </View>
        </ScreenHero>

        <View style={styles.body}>
          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <SectionCard style={styles.progressCard}>
            <View style={styles.accentStrip} />
            <View style={styles.progressHeader}>
              <View style={styles.progressBody}>
                <Text style={styles.progressEyebrow}>{lt("DOOR PROGRESS", "ПРОГРЕСС ДВЕРЕЙ", "התקדמות דלתות")}</Text>
                <Text style={styles.progressValue}>{completion.installed} <Text style={styles.progressTotal}>/ {completion.total}</Text></Text>
              </View>
              <StatusPill label={`${completion.percent}%`} tone={completion.percent === 100 ? "success" : "accent"} />
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${completion.percent}%` }]} />
            </View>
            <View style={styles.legend}>
              <LegendDot color={installerTheme.successFill} label={lt("Installed", "Установлено", "הותקן")} value={completion.installed} />
              <LegendDot color={installerTheme.warningFill} label={lt("Not installed", "Не установлено", "לא הותקן")} value={completion.notInstalled} />
              <LegendDot color={installerTheme.dangerFill} label={lt("Issues", "Проблемы", "תקלות")} value={completion.problem} />
              <LegendDot color={installerTheme.textFaint} label={lt("Locked", "Заблокировано", "נעול")} value={completion.locked} />
            </View>
          </SectionCard>

          <View style={styles.quickActions}>
            {externalActions.map((action) => (
              <QuickAction
                key={action.kind}
                icon={action.kind === "waze" ? "navigate-outline" : action.kind === "whatsapp" ? "logo-whatsapp" : "call-outline"}
                label={action.kind === "waze" ? "Waze" : action.kind === "whatsapp" ? "WhatsApp" : lt("Call", "Позвонить", "שיחה")}
                tone={action.kind === "whatsapp" ? "success" : action.kind === "waze" ? "info" : "accent"}
                onPress={() => void openExternal(action)}
              />
            ))}
            <QuickAction
              icon="alert-circle-outline"
              label={lt("Flag issue", "Проблема", "דיווח תקלה")}
              tone="danger"
              onPress={() =>
                router.push(
                  `/issues?projectId=${encodeURIComponent(projectId)}${selectedDoor ? `&doorId=${encodeURIComponent(selectedDoor.id)}` : ""}&compose=1` as never
                )
              }
            />
          </View>

          {issues.length ? (
            <SectionCard style={styles.issueSection}>
              <SectionHeader
                title={lt("Project issues", "Проблемы объекта", "תקלות בפרויקט")}
                meta={visibleIssues.length}
                action={
                  <View style={styles.issueFilter}>
                    <SegmentedControl
                      value={issueFilter}
                      onChange={setIssueFilter}
                      options={[
                        { value: "OPEN", label: lt("Open", "Открытые", "פתוחות") },
                        { value: "ALL", label: lt("All", "Все", "הכול") },
                      ]}
                    />
                  </View>
                }
              />
              <View style={styles.issueList}>
                {visibleIssues.slice(0, 5).map((issue) => {
                  const issueDoor = doors.find((door) => door.id === issue.door_id);
                  return (
                    <Pressable
                      key={issue.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${issue.title || lt("Reported issue", "Заявленная проблема", "תקלה שדווחה")}. ${issueDoor?.unit_label || lt("Door", "Дверь", "דלת")}`}
                      onPress={() => {
                        setSelectedDoorId(issue.door_id);
                        setDoorSearch(issueDoor?.unit_label || "");
                      }}
                      style={({ pressed }) => [styles.issueRow, pressed && styles.pressed]}
                    >
                      <View style={styles.issueIcon}>
                        <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
                      </View>
                      <View style={styles.issueBody}>
                        <Text style={styles.issueTitle} numberOfLines={1}>{issue.title || lt("Reported issue", "Заявленная проблема", "תקלה שדווחה")}</Text>
                        <Text style={styles.issueMeta} numberOfLines={2}>
                          {issueDoor?.unit_label || lt("Door", "Дверь", "דלת")} · {issue.details || lt("No details", "Без описания", "ללא תיאור")}
                        </Text>
                      </View>
                      <StatusPill label={translateEnum(locale, issue.status)} tone={issue.status === "CLOSED" ? "success" : "danger"} />
                    </Pressable>
                  );
                })}
              </View>
            </SectionCard>
          ) : null}

          <SectionCard>
            <SectionHeader title={lt("Door filters", "Фильтры дверей", "סינון דלתות")} meta={`${filteredDoors.length}/${doors.length}`} />
            <TextInput
              value={doorSearch}
              onChangeText={setDoorSearch}
              accessibilityLabel={lt("Search doors", "Поиск дверей", "חיפוש דלתות")}
              placeholder={lt("Door, order, apartment…", "Дверь, заказ, квартира…", "דלת, הזמנה, דירה…")}
              placeholderTextColor={installerTheme.textFaint}
              style={styles.input}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {["ALL", "NOT_INSTALLED", "INSTALLED", "ISSUES", "LOCKED"].map((status) => (
                <FilterChip
                  key={status}
                  active={doorStatusFilter === status}
                  label={
                    status === "ALL"
                      ? lt("All", "Все", "הכול")
                      : status === "ISSUES"
                        ? lt("Issues", "Проблемы", "תקלות")
                        : translateEnum(locale, status)
                  }
                  onPress={() => setDoorStatusFilter(status)}
                />
              ))}
            </ScrollView>
            {orderNumbers.length > 1 ? (
              <>
                <Text style={styles.fieldLabel}>{lt("Order", "Заказ", "הזמנה")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  <FilterChip active={selectedOrderNumber === "ALL"} label={lt("All orders", "Все заказы", "כל ההזמנות")} onPress={() => setSelectedOrderNumber("ALL")} />
                  {orderNumbers.map((order) => (
                    <FilterChip key={order} active={selectedOrderNumber === order} label={order} onPress={() => setSelectedOrderNumber(order)} />
                  ))}
                </ScrollView>
              </>
            ) : null}
            {locationCodes.length > 1 ? (
              <>
                <Text style={styles.fieldLabel}>{lt("Location", "Локация", "מיקום")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  <FilterChip active={selectedLocationCode === "ALL"} label={lt("All locations", "Все локации", "כל המיקומים")} onPress={() => setSelectedLocationCode("ALL")} />
                  {locationCodes.map((location) => (
                    <FilterChip key={location} active={selectedLocationCode === location} label={location} onPress={() => setSelectedLocationCode(location)} />
                  ))}
                </ScrollView>
              </>
            ) : null}
            {(doorSearch || doorStatusFilter !== "ALL" || selectedOrderNumber !== "ALL" || selectedLocationCode !== "ALL") ? (
              <ActionButton
                label={lt("Reset filters", "Сбросить фильтры", "איפוס מסננים")}
                icon="close"
                variant="secondary"
                style={styles.resetButton}
                onPress={resetFilters}
              />
            ) : null}
          </SectionCard>

          <View style={styles.floorSection}>
            <SectionHeader title={lt("Doors by floor", "Двери по этажам", "דלתות לפי קומה")} meta={filteredDoors.length} />
            {groupedDoors.length ? (
              <View style={styles.explorerLayout}>
                <View
                  style={[
                    styles.floorShaft,
                    { height: Math.min(520, Math.max(146, 100 + groupedDoors.length * 46)) },
                  ]}
                >
                  <View pointerEvents="none" style={styles.floorShaftLine} />
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.floorNavigator}
                  >
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: focusedFloor === "ALL" }}
                      accessibilityLabel={lt("Show all floors", "Показать все этажи", "הצגת כל הקומות")}
                      onPress={() => setFocusedFloor("ALL")}
                      style={[styles.floorNavItem, focusedFloor === "ALL" && styles.floorNavItemActive]}
                    >
                      <Ionicons
                        name="layers-outline"
                        size={15}
                        color={focusedFloor === "ALL" ? installerTheme.info : installerTheme.textMuted}
                      />
                    </Pressable>
                    {groupedDoors.map(([floor, floorDoors]) => {
                      const active = focusedFloor === floor;
                      const issueCount = floorDoors.filter((door) => issueDoorIds.has(door.id)).length;
                      return (
                        <Pressable
                          key={floor}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${lt("Floor", "Этаж", "קומה")} ${floor}. ${floorDoors.length} ${lt("positions", "позиций", "מיקומים")}${issueCount ? `. ${formatIssueCount(locale, issueCount)}` : ""}`}
                          onPress={() => {
                            setFocusedFloor(floor);
                            setSelectedDoorId(floorDoors[0]?.id || "");
                          }}
                          style={[styles.floorNavItem, active && styles.floorNavItemActive]}
                        >
                          <Text style={[styles.floorNavLabel, active && styles.floorNavLabelActive]}>{floor}</Text>
                          {issueCount ? <View style={styles.floorNavIssue} /> : null}
                          {active ? <View style={styles.floorNavActiveRail} /> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.floorList}>
                  {displayedFloorGroups.map(([floor, floorDoors]) => {
                    const floorInstalled = floorDoors.filter((door) => door.status === "INSTALLED").length;
                    const floorIssues = floorDoors.filter((door) => issueDoorIds.has(door.id)).length;
                    const floorProgress = floorDoors.filter((door) => door.status === "IN_PROGRESS").length;
                    const floorPercent = Math.round((floorInstalled / floorDoors.length) * 100);
                    return (
                      <SectionCard key={floor} style={styles.floorCard}>
                        <View style={styles.floorHeader}>
                          <View style={styles.floorHeading}>
                            <Text style={styles.floorTitle}>{lt("Floor", "Этаж", "קומה")} {floor}</Text>
                            <Text style={styles.floorMeta}>{floorDoors.length} {lt("doors", "дверей", "דלתות")}</Text>
                          </View>
                          <Text style={styles.floorPercent}>{floorPercent}%</Text>
                        </View>
                        <View style={styles.floorProgressRow}>
                          <View style={styles.floorProgressTrack}>
                            <View
                              style={[
                                styles.floorProgressFill,
                                {
                                  width: `${floorPercent}%`,
                                  backgroundColor: floorIssues
                                    ? installerTheme.warning
                                    : installerTheme.success,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.floorProgressText}>
                            {floorInstalled}/{floorDoors.length}
                          </Text>
                        </View>
                        <View style={styles.floorSummaryRow}>
                          <FloorSummary tone="success" value={floorInstalled} label={lt("Installed", "Установлено", "הותקנו")} />
                          <FloorSummary tone="info" value={floorProgress} label={lt("In progress", "В работе", "בתהליך")} />
                          <FloorSummary tone={floorIssues ? "warning" : "neutral"} value={floorIssues} label={lt("Issues", "Проблемы", "תקלות")} />
                        </View>
                        <View style={styles.doorList}>
                          {floorDoors.map((door) => (
                            <DoorExplorerRow
                              key={door.id}
                              door={door}
                              typeLabel={doorTypes.find((doorType) => doorType.id === door.door_type_id)?.name || door.door_type_id}
                              positionLabel={buildDoorPositionLabel(door, locale)}
                              selected={door.id === selectedDoorId}
                              hasIssue={issueDoorIds.has(door.id)}
                              locale={locale}
                              onPress={() => setSelectedDoorId(door.id)}
                            />
                          ))}
                        </View>
                      </SectionCard>
                    );
                  })}
                </View>
              </View>
            ) : (
              <SectionCard>
                <EmptyState
                  icon="search-outline"
                  title={lt("No matching doors", "Двери не найдены", "לא נמצאו דלתות")}
                  action={<ActionButton label={lt("Reset filters", "Сбросить фильтры", "איפוס מסננים")} variant="secondary" onPress={resetFilters} />}
                />
              </SectionCard>
            )}
          </View>

          {selectedDoor ? (
            <SectionCard style={styles.doorDetail}>
              <View style={[styles.doorDetailStrip, { backgroundColor: doorStatusColors(selectedDoor, selectedDoorIssues.length > 0).text }]} />
              <View style={styles.doorImageHero}>
                <Image
                  source={require("../../assets/premium/door-premium.jpg")}
                  resizeMode="cover"
                  style={StyleSheet.absoluteFillObject}
                  accessibilityIgnoresInvertColors
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={["rgba(8,14,21,0.04)", "rgba(8,14,21,0.46)", installerTheme.background]}
                  locations={[0, 0.48, 1]}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.doorImageContent}>
                  <Text style={styles.doorEyebrow}>{lt("Selected position", "Выбранная позиция", "מיקום נבחר")}</Text>
                  <View style={styles.doorImageTitleRow}>
                    <View style={styles.doorHeroBody}>
                      <Text style={styles.doorNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                        {selectedDoor.unit_label}
                      </Text>
                      <Text style={styles.doorType} numberOfLines={1}>
                        {selectedDoorType?.name || selectedDoorType?.code || selectedDoor.door_type_id}
                      </Text>
                    </View>
                    <StatusPill
                      label={translateEnum(locale, selectedDoorIssues.length ? "ISSUE_OPEN" : selectedDoor.status)}
                      tone={doorStatusTone(selectedDoor, selectedDoorIssues.length > 0)}
                    />
                  </View>
                  <View style={styles.doorBadges}>
                    {selectedDoorIssues.length ? <StatusPill label={formatIssueCount(locale, selectedDoorIssues.length)} tone="danger" /> : null}
                    {selectedDoorPendingEvents.length ? (
                      <StatusPill
                        label={`${selectedDoorPendingEvents.length} ${lt("queued", "в очереди", "בתור")}`}
                        tone={selectedDoorPendingEvents.some((event) => event.status !== "PENDING") ? "danger" : "warning"}
                        icon="cloud-upload-outline"
                      />
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.doorFacts}>
                <DoorFact label={lt("Order", "Заказ", "הזמנה")} value={selectedDoor.order_number} />
                <DoorFact label={lt("Floor", "Этаж", "קומה")} value={selectedDoor.floor_label} />
                <DoorFact label={lt("Apartment", "Квартира", "דירה")} value={selectedDoor.apartment_number} />
                <DoorFact label={lt("Marking", "Маркировка", "סימון")} value={selectedDoor.door_marking} />
                <DoorFact label={lt("Location", "Локация", "מיקום")} value={selectedDoor.location_code} />
                <DoorFact label={lt("Version", "Версия", "גרסה")} value={String(selectedDoor.version)} />
              </View>

              {selectedDoorIssues.map((issue) => (
                <View key={issue.id} style={styles.selectedIssue}>
                  <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
                  <View style={styles.selectedIssueBody}>
                    <Text style={styles.selectedIssueTitle}>{issue.title || lt("Door issue", "Проблема двери", "תקלה בדלת")}</Text>
                    {issue.details ? <Text style={styles.selectedIssueText}>{issue.details}</Text> : null}
                  </View>
                </View>
              ))}

              {doorActionState?.isLocked ? (
                <View style={styles.lockedBox}>
                  <Ionicons name="lock-closed-outline" size={18} color={installerTheme.textMuted} />
                  <Text style={styles.lockedText}>
                    {lt("This door is locked after completion.", "Дверь заблокирована после завершения.", "הדלת נעולה לאחר השלמה.")}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.doorActionDeck}>
                    <View style={styles.actionDeckHeader}>
                      <View style={styles.actionDeckIcon}>
                        <Ionicons name="construct-outline" size={18} color={installerTheme.info} />
                      </View>
                      <View style={styles.actionDeckHeading}>
                        <Text style={styles.actionDeckEyebrow}>{lt("FIELD UPDATE", "ПОЛЕВОЙ СТАТУС", "עדכון שטח")}</Text>
                        <Text style={styles.actionDeckTitle}>{lt("Record the result", "Зафиксировать результат", "תיעוד התוצאה")}</Text>
                      </View>
                      <View style={styles.offlineReady}>
                        <View style={styles.offlineReadyDot} />
                        <Text style={styles.offlineReadyText}>{lt("OFFLINE", "ОФЛАЙН", "לא מקוון")}</Text>
                      </View>
                    </View>
                    <View style={styles.doorActions}>
                      <ActionButton
                        label={lt("Installed", "Установлено", "הותקנה")}
                        icon="checkmark"
                        loading={busy}
                        disabled={!doorActionState?.canMarkInstalled}
                        style={styles.flex}
                        onPress={() => void handleInstall()}
                      />
                      <ActionButton
                        label={lt("Not installed", "Не установлено", "לא הותקנה")}
                        icon="close"
                        variant="secondary"
                        disabled={!doorActionState?.canMarkNotInstalled}
                        style={styles.flex}
                        onPress={() => setShowNotInstalledForm(true)}
                      />
                    </View>
                  </View>

                  {showNotInstalledForm ? (
                    <View style={styles.notInstalledPanel}>
                      <View style={styles.notInstalledHeader}>
                        <View style={styles.notInstalledHeading}>
                          <Text style={styles.notInstalledTitle}>{lt("Why was it not installed?", "Почему дверь не установлена?", "מדוע הדלת לא הותקנה?")}</Text>
                          <Text style={styles.notInstalledMeta}>{selectedDoor.unit_label}</Text>
                        </View>
                        <IconButton
                          icon="close"
                          label={lt("Close reason form", "Закрыть выбор причины", "סגירת בחירת סיבה")}
                          onPress={() => setShowNotInstalledForm(false)}
                        />
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                        {reasons.map((reason) => (
                          <FilterChip
                            key={reason.id}
                            active={selectedReasonId === reason.id}
                            label={reason.name || reason.code}
                            onPress={() => setSelectedReasonId(reason.id)}
                          />
                        ))}
                      </ScrollView>
                      {selectedReason ? <Text style={styles.reasonCode}>{selectedReason.code}</Text> : null}
                      <TextInput
                        value={doorComment}
                        onChangeText={setDoorComment}
                        accessibilityLabel={lt("Door comment", "Комментарий по двери", "הערה לדלת")}
                        placeholder={lt("Comment for the office…", "Комментарий для офиса…", "הערה למשרד…")}
                        placeholderTextColor={installerTheme.textFaint}
                        multiline
                        maxLength={1000}
                        style={[styles.input, styles.textarea]}
                      />
                    <ActionButton
                      label={lt("Confirm not installed", "Подтвердить: не установлено", "אישור: לא הותקנה")}
                      icon="checkmark-circle-outline"
                      variant="danger"
                      loading={busy}
                      disabled={!doorActionState?.canMarkNotInstalled}
                      onPress={() => void handleNotInstalled()}
                    />
                    </View>
                  ) : null}
                </>
              )}
              <ActionButton
                label={lt("Report issue for this door", "Сообщить о проблеме двери", "דיווח תקלה בדלת")}
                icon="alert-circle-outline"
                variant="danger"
                style={styles.reportButton}
                onPress={() =>
                  router.push(`/issues?projectId=${encodeURIComponent(projectId)}&doorId=${encodeURIComponent(selectedDoor.id)}&compose=1` as never)
                }
              />
              <Text style={styles.updatedText}>
                {lt("Last local update", "Последнее локальное обновление", "עדכון מקומי אחרון")}: {formatDateTime(selectedDoor.updated_at)}
              </Text>
            </SectionCard>
          ) : null}

          <SectionCard>
            <SectionHeader title={lt("Completed add-on work", "Выполненные допработы", "עבודות נוספות שבוצעו")} meta={addonFacts.length} />
            {addonTypes.length ? (
              <>
                <Text style={styles.fieldLabel}>{lt("Add-on type", "Тип допработы", "סוג עבודה נוספת")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {addonTypes.map((addon) => (
                    <FilterChip
                      key={addon.id}
                      active={addonTypeId === addon.id}
                      label={`${addon.name}${addon.qty_planned ? ` · ${addon.qty_planned} ${addon.unit}` : ""}`}
                      onPress={() => setAddonTypeId(addon.id)}
                    />
                  ))}
                </ScrollView>
                <View style={styles.addonInputs}>
                  <TextInput
                    value={addonQty}
                    onChangeText={setAddonQty}
                    accessibilityLabel={lt("Completed quantity", "Выполненное количество", "כמות שבוצעה")}
                    placeholder={lt("Quantity…", "Количество…", "כמות…")}
                    placeholderTextColor={installerTheme.textFaint}
                    keyboardType="decimal-pad"
                    style={[styles.input, styles.qtyInput]}
                  />
                  <TextInput
                    value={addonComment}
                    onChangeText={setAddonComment}
                    accessibilityLabel={lt("Add-on comment", "Комментарий к допработе", "הערה לעבודה נוספת")}
                    placeholder={lt("Comment…", "Комментарий…", "הערה…")}
                    placeholderTextColor={installerTheme.textFaint}
                    style={[styles.input, styles.flex]}
                  />
                </View>
                <ActionButton
                  label={lt("Save completed add-on", "Сохранить допработу", "שמירת עבודה נוספת")}
                  icon="add"
                  disabled={!addonActionState.canQueueAddonFact}
                  onPress={() => void handleAddonFact()}
                />
              </>
            ) : (
              <Text style={styles.emptyCopy}>{lt("No add-on catalog is assigned to this project.", "Для объекта не назначен каталог допработ.", "לא הוגדר קטלוג עבודות נוספות לפרויקט.")}</Text>
            )}
            {addonFacts.length ? (
              <View style={styles.factList}>
                {addonFacts.slice(0, 6).map((fact) => (
                  <View key={fact.id} style={styles.factRow}>
                    <View style={styles.factIcon}>
                      <Ionicons name="add-circle-outline" size={17} color={installerTheme.purple} />
                    </View>
                    <View style={styles.factBody}>
                      <Text style={styles.factTitle}>{fact.addon_name}</Text>
                      <Text style={styles.factMeta}>
                        {fact.qty_done}{fact.unit ? ` ${fact.unit}` : ""} · {formatDateTime(fact.done_at)}
                      </Text>
                      {fact.comment ? <Text style={styles.factComment}>{fact.comment}</Text> : null}
                    </View>
                    <StatusPill label={translateEnum(locale, fact.source)} tone={fact.source === "OFFLINE" ? "warning" : "success"} />
                  </View>
                ))}
              </View>
            ) : null}
          </SectionCard>

          <View style={styles.metrics}>
            <MetricTile
              label={lt("Today pay", "Заработок сегодня", "שכר היום")}
              value={projectEarnings ? `${projectEarnings.todayTotal} ${projectEarnings.currency}` : "—"}
              meta={lt("read-only backend calculation", "расчёт backend", "חישוב שרת")}
              tone="success"
            />
            <MetricTile
              label={lt("Month pay", "Заработок за месяц", "שכר חודשי")}
              value={projectEarnings ? `${projectEarnings.monthTotal} ${projectEarnings.currency}` : "—"}
              meta={`${projectEarnings?.rows.length || 0} ${lt("work rows", "строк работ", "שורות עבודה")}`}
              tone="accent"
            />
          </View>
          <ActionButton
            label={lt("Open full earnings", "Открыть полный заработок", "פתיחת פירוט שכר")}
            icon="cash-outline"
            variant="secondary"
            onPress={() => router.push("/earnings" as never)}
          />

          <SectionCard>
            <SectionHeader title={lt("Project sync queue", "Очередь синхронизации объекта", "תור סנכרון הפרויקט")} meta={pendingEvents.length} />
            <View style={styles.queueSummary}>
              <StatusPill label={`${queueSummary?.pending || 0} ${lt("pending", "ожидают", "ממתינות")}`} tone="neutral" />
              <StatusPill label={`${queueSummary?.failed || 0} ${lt("failed", "ошибок", "נכשלו")}`} tone="warning" />
              <StatusPill label={`${queueSummary?.blocked || 0} ${lt("blocked", "заблокировано", "חסומות")}`} tone="danger" />
            </View>
            {pendingEvents.slice(0, 3).map((event) => (
              <View key={event.client_event_id} style={styles.pendingRow}>
                <Ionicons name="cloud-upload-outline" size={17} color={installerTheme.textMuted} />
                <View style={styles.pendingBody}>
                  <Text style={styles.pendingTitle}>{translateEnum(locale, event.type)}</Text>
                  <Text style={styles.pendingMeta}>{formatDateTime(event.created_at)} · {translateEnum(locale, event.status)}</Text>
                </View>
              </View>
            ))}
            <View style={styles.syncActions}>
              <ActionButton
                label={lt("Sync now", "Синхронизировать", "סנכרון עכשיו")}
                icon="sync"
                loading={busy}
                disabled={busy || !pendingEvents.length}
                style={styles.flex}
                onPress={() => void handleSync()}
              />
              <ActionButton
                label={lt("Open queue", "Открыть очередь", "פתיחת התור")}
                icon="list-outline"
                variant="secondary"
                style={styles.flex}
                onPress={() => router.push("/sync-queue" as never)}
              />
            </View>
          </SectionCard>
        </View>
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendValue}>{value}</Text>
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function formatIssueCount(locale: "en" | "ru" | "he", count: number) {
  if (locale === "he") return `${count} ${count === 1 ? "תקלה" : "תקלות"}`;
  if (locale === "en") return `${count} ${count === 1 ? "issue" : "issues"}`;

  const modulo100 = count % 100;
  const modulo10 = count % 10;
  const noun = modulo10 === 1 && modulo100 !== 11
    ? "проблема"
    : modulo10 >= 2 && modulo10 <= 4 && (modulo100 < 12 || modulo100 > 14)
      ? "проблемы"
      : "проблем";
  return `${count} ${noun}`;
}

function QuickAction({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  tone: InstallerTone;
  onPress: () => void;
}) {
  const colors = toneColors(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <View style={[styles.quickIcon, { backgroundColor: colors.background }]}>
        <Ionicons name={icon} size={19} color={colors.text} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function FloorSummary({
  tone,
  value,
  label,
}: {
  tone: InstallerTone;
  value: number;
  label: string;
}) {
  const colors = toneColors(tone);
  return (
    <View style={[styles.floorSummary, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[styles.floorSummaryDot, { backgroundColor: colors.text }]} />
      <Text style={[styles.floorSummaryValue, { color: colors.text }]}>{value}</Text>
      <Text style={styles.floorSummaryLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function DoorExplorerRow({
  door,
  typeLabel,
  positionLabel,
  selected,
  hasIssue,
  locale,
  onPress,
}: {
  door: InstallerDoor;
  typeLabel: string;
  positionLabel: string;
  selected: boolean;
  hasIssue: boolean;
  locale: "en" | "ru" | "he";
  onPress: () => void;
}) {
  const colors = doorStatusColors(door, hasIssue);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${door.unit_label}, ${positionLabel}, ${translateEnum(locale, door.status)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.doorExplorerRow,
        selected && styles.doorExplorerRowSelected,
        pressed && styles.doorTilePressed,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.doorExplorerAccent,
          { backgroundColor: colors.text },
          selected && styles.doorExplorerAccentSelected,
        ]}
      />
      <View style={[styles.doorThumb, { borderColor: colors.border, shadowColor: colors.text }]}>
        <View style={[styles.doorThumbLeaf, { borderColor: colors.text }]}>
          <View style={styles.doorThumbInset} />
          <View style={[styles.doorThumbHandle, { backgroundColor: installerTheme.accent }]} />
        </View>
        <View style={[styles.doorThumbStatus, { backgroundColor: colors.text }]} />
      </View>
      <View style={styles.doorExplorerBody}>
        <Text style={styles.doorExplorerNumber} numberOfLines={2}>{door.unit_label}</Text>
        <Text style={styles.doorExplorerType} numberOfLines={1}>{typeLabel}</Text>
        <View style={styles.doorExplorerMetaRow}>
          <Ionicons
            name={door.location_code?.toLowerCase().includes("mamad") ? "shield-checkmark-outline" : "flame-outline"}
            size={11}
            color={installerTheme.textFaint}
          />
          <Text style={styles.doorExplorerMeta} numberOfLines={1}>{positionLabel}</Text>
        </View>
      </View>
      <View style={styles.doorExplorerState}>
        <StatusPill
          label={translateEnum(locale, hasIssue ? "ISSUE_OPEN" : door.status)}
          tone={doorStatusTone(door, hasIssue)}
        />
        <Ionicons name="chevron-forward" size={16} color={installerTheme.textFaint} />
      </View>
    </Pressable>
  );
}

function DoorTile({
  door,
  sequence,
  positionLabel,
  selected,
  hasIssue,
  locale,
  onPress,
}: {
  door: InstallerDoor;
  sequence: number;
  positionLabel: string;
  selected: boolean;
  hasIssue: boolean;
  locale: "en" | "ru" | "he";
  onPress: () => void;
}) {
  const colors = doorStatusColors(door, hasIssue);
  const statusIcon = doorStatusIcon(door, hasIssue);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${door.unit_label}, ${positionLabel}, ${translateEnum(locale, door.status)}${hasIssue ? `, ${locale === "ru" ? "есть проблема" : locale === "he" ? "קיימת תקלה" : "has issue"}` : ""}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.doorTile,
        selected && styles.doorTileSelected,
        pressed && styles.doorTilePressed,
      ]}
    >
      <View style={styles.doorSequenceRow}>
        <Text style={styles.doorSequence}>{String(sequence).padStart(2, "0")}</Text>
        {selected ? <View style={styles.selectedBeacon} /> : null}
      </View>
      <View
        style={[
          styles.doorElevation,
          { backgroundColor: colors.background, borderColor: colors.text, shadowColor: colors.text },
          selected && styles.doorElevationSelected,
        ]}
      >
        <View style={[styles.doorElevationInset, { borderColor: colors.border }]} />
        <View style={[styles.doorHinge, styles.doorHingeTop]} />
        <View style={[styles.doorHinge, styles.doorHingeBottom]} />
        <View style={[styles.doorStatusBeacon, { backgroundColor: colors.text }]}>
          <Ionicons name={statusIcon} size={10} color={installerTheme.textOnDark} />
        </View>
        <View style={[styles.miniDoorHandle, { backgroundColor: hasIssue ? installerTheme.dangerFill : installerTheme.accent }]} />
        <View style={styles.doorThreshold} />
        {hasIssue ? <View style={styles.issueFlag}><Ionicons name="alert" size={8} color={installerTheme.textOnDark} /></View> : null}
      </View>
      <Text style={styles.doorTileNumber} numberOfLines={1}>{door.unit_label}</Text>
      <Text style={styles.doorTilePosition} numberOfLines={1}>{positionLabel}</Text>
      <View style={[styles.doorGroundLight, { backgroundColor: colors.text }, selected && styles.doorGroundLightSelected]} />
    </Pressable>
  );
}

function buildDoorPositionLabel(door: InstallerDoor, locale: "en" | "ru" | "he") {
  if (door.apartment_number) {
    const prefix = locale === "ru" ? "кв." : locale === "he" ? "דירה" : "Apt";
    return `${prefix} ${door.apartment_number}`;
  }
  if (door.location_code) return door.location_code;
  if (door.door_marking) return door.door_marking;
  if (door.house_number) {
    const prefix = locale === "ru" ? "дом" : locale === "he" ? "בניין" : "House";
    return `${prefix} ${door.house_number}`;
  }
  return locale === "ru" ? "позиция" : locale === "he" ? "מיקום" : "Position";
}

function doorStatusIcon(
  door: InstallerDoor,
  hasIssue: boolean,
): React.ComponentProps<typeof Ionicons>["name"] {
  if (hasIssue) return "alert";
  if (door.status === "INSTALLED") return "checkmark";
  if (door.status === "NOT_INSTALLED") return "time-outline";
  if (door.status === "LOCKED" || door.is_locked) return "lock-closed";
  return "construct-outline";
}

function DoorFact({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.doorFact}>
      <Text style={styles.doorFactLabel}>{label}</Text>
      <Text style={styles.doorFactValue} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}

function doorStatusTone(door: InstallerDoor, hasIssue: boolean): InstallerTone {
  if (hasIssue) return "danger";
  if (door.status === "INSTALLED") return "success";
  if (door.status === "NOT_INSTALLED") return "warning";
  if (door.status === "LOCKED" || door.is_locked) return "neutral";
  return "info";
}

function doorStatusColors(door: InstallerDoor, hasIssue: boolean) {
  return toneColors(doorStatusTone(door, hasIssue));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  content: { flex: 1 },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  heroActions: { flexDirection: "row", gap: 7 },
  heroBadges: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  body: { gap: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.dangerBorder,
    backgroundColor: installerTheme.dangerSoft,
    padding: 11,
  },
  errorText: { flex: 1, color: installerTheme.danger, fontSize: 11, lineHeight: 16 },
  progressCard: { position: "relative", overflow: "hidden", paddingStart: 16 },
  accentStrip: { position: "absolute", top: 0, bottom: 0, start: 0, width: 4, backgroundColor: installerTheme.accent },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  progressBody: { flex: 1 },
  progressEyebrow: { color: installerTheme.textMuted, fontSize: 9, fontWeight: "800" },
  progressValue: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 22, marginTop: 3 },
  progressTotal: { color: installerTheme.textFaint, fontSize: 15, fontWeight: "600" },
  progressTrack: { height: 7, overflow: "hidden", borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.border, marginTop: 10 },
  progressFill: { height: "100%", borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.successFill },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { color: installerTheme.textMuted, fontSize: 9 },
  legendValue: { color: installerTheme.text, fontWeight: "800" },
  quickActions: { flexDirection: "row", gap: 7 },
  quickAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.shellRaised,
    padding: 7,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  quickIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill },
  quickLabel: { color: installerTheme.text, fontSize: 9, lineHeight: 12, fontWeight: "800", textAlign: "center" },
  issueSection: { borderColor: installerTheme.dangerBorder },
  issueFilter: { width: 148, maxWidth: "48%", flexShrink: 1 },
  issueList: { marginTop: 8 },
  issueRow: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  issueIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.dangerSoft },
  issueBody: { flex: 1, minWidth: 0 },
  issueTitle: { color: installerTheme.text, fontSize: 11, fontWeight: "800" },
  issueMeta: { color: installerTheme.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  input: {
    minHeight: 44,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.shellRaised,
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  textarea: { minHeight: 86, textAlignVertical: "top" },
  chips: { gap: 7, paddingEnd: 12, marginTop: 9 },
  chip: {
    maxWidth: 240,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.shellRaised,
    paddingHorizontal: 12,
  },
  chipActive: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.primarySoft },
  chipText: { color: installerTheme.textMuted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: installerTheme.info },
  fieldLabel: { color: installerTheme.textMuted, fontSize: 9, fontWeight: "800", textTransform: "uppercase", marginTop: 13 },
  resetButton: { marginTop: 11 },
  floorSection: { gap: 10 },
  explorerLayout: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  floorShaft: {
    position: "relative",
    width: 54,
    overflow: "hidden",
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: "rgba(19,24,33,0.82)",
  },
  floorShaftLine: {
    position: "absolute",
    top: 14,
    bottom: 14,
    start: 26,
    width: 1,
    backgroundColor: installerTheme.infoBorder,
  },
  floorNavigator: { alignItems: "center", gap: 4, paddingVertical: 15 },
  floorNavItem: {
    position: "relative",
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(8,14,21,0.72)",
  },
  floorNavItemActive: {
    transform: [{ scale: 1.05 }],
    borderColor: installerTheme.primary,
    backgroundColor: installerTheme.primarySoft,
    shadowColor: installerTheme.info,
    shadowOpacity: 0.58,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  floorNavLabel: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: 11 },
  floorNavLabelActive: { color: installerTheme.info },
  floorNavIssue: {
    position: "absolute",
    top: 4,
    end: 4,
    width: 6,
    height: 6,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.danger,
    shadowColor: installerTheme.danger,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  floorNavActiveRail: {
    position: "absolute",
    end: -8,
    width: 8,
    height: 3,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.info,
    shadowColor: installerTheme.info,
    shadowOpacity: 1,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  floorList: { flex: 1, minWidth: 0, gap: 12 },
  floorCard: {
    padding: 0,
    overflow: "hidden",
    borderRadius: installerTheme.radius.glass,
  },
  floorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 10,
  },
  floorHeading: { flex: 1, minWidth: 0 },
  floorTitle: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 18 },
  floorMeta: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: 10, marginTop: 3 },
  floorPercent: { color: installerTheme.info, fontFamily: installerTheme.fontFamilyMono, fontSize: 12 },
  floorProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  floorSummaryRow: { flexDirection: "row", gap: 5, paddingHorizontal: 10, paddingBottom: 10 },
  floorSummary: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 5,
  },
  floorSummaryDot: { width: 5, height: 5, borderRadius: 3 },
  floorSummaryValue: { fontFamily: installerTheme.fontFamilyMono, fontSize: 9 },
  floorSummaryLabel: { flexShrink: 1, color: installerTheme.textMuted, fontSize: 8, lineHeight: 10 },
  doorList: { borderTopWidth: 1, borderTopColor: installerTheme.border },
  doorExplorerRow: {
    position: "relative",
    overflow: "hidden",
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: installerTheme.border,
  },
  doorExplorerRowSelected: { backgroundColor: installerTheme.primarySoft },
  doorExplorerAccent: {
    position: "absolute",
    top: 10,
    bottom: 10,
    start: 0,
    width: 2,
    opacity: 0.45,
  },
  doorExplorerAccentSelected: {
    width: 3,
    opacity: 1,
  },
  doorThumb: {
    position: "relative",
    width: 48,
    height: 56,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: installerTheme.background,
    shadowOpacity: 0.28,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  doorThumbLeaf: {
    position: "relative",
    width: 26,
    height: 40,
    borderRadius: 3,
    borderWidth: 1,
    backgroundColor: installerTheme.doorMaterial,
    padding: 3,
  },
  doorThumbInset: { flex: 1, borderRadius: 2, borderWidth: 1, borderColor: installerTheme.doorMaterialInset },
  doorThumbHandle: { position: "absolute", end: 3, top: 19, width: 3, height: 3, borderRadius: 2 },
  doorThumbStatus: { position: "absolute", start: 0, end: 0, bottom: 0, height: 3 },
  doorExplorerBody: { flex: 1, minWidth: 0 },
  doorExplorerNumber: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 12, lineHeight: 15 },
  doorExplorerType: { color: installerTheme.textMuted, fontSize: 9, marginTop: 3 },
  doorExplorerMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  doorExplorerMeta: { flex: 1, color: installerTheme.textFaint, fontFamily: installerTheme.fontFamilyMono, fontSize: 8 },
  doorExplorerState: { maxWidth: 102, alignItems: "flex-end", gap: 7 },
  floorProgressTrack: { flex: 1, minWidth: 0, height: 5, overflow: "hidden", borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.border },
  floorProgressFill: { height: "100%", borderRadius: installerTheme.radius.pill },
  floorProgressText: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: 8 },
  corridor: {
    position: "relative",
    minHeight: 152,
    overflow: "hidden",
    backgroundColor: installerTheme.background,
  },
  corridorArchitecture: {
    ...StyleSheet.absoluteFillObject,
  },
  corridorCeiling: {
    position: "absolute",
    top: 18,
    start: 0,
    end: 0,
    height: 1,
    backgroundColor: installerTheme.shellBorderSoft,
  },
  corridorLine: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 30,
    height: 2,
    backgroundColor: installerTheme.borderStrong,
  },
  corridorPerspective: {
    position: "absolute",
    bottom: 29,
    width: 1,
    height: 100,
    backgroundColor: installerTheme.shellBorderSoft,
  },
  corridorPerspectiveStart: {
    start: 24,
    transform: [{ rotate: "17deg" }],
  },
  corridorPerspectiveEnd: {
    end: 24,
    transform: [{ rotate: "-17deg" }],
  },
  doorRail: { alignItems: "flex-end", gap: 7, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 14 },
  doorTile: {
    width: 76,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "flex-end",
    borderRadius: installerTheme.radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 4,
    paddingTop: 5,
    paddingBottom: 6,
    position: "relative",
  },
  doorTileSelected: {
    transform: [{ translateY: -5 }],
    borderColor: installerTheme.infoBorder,
    backgroundColor: installerTheme.primarySoft,
    elevation: 6,
    shadowColor: installerTheme.info,
    shadowOpacity: 0.28,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 4 },
  },
  doorTilePressed: { transform: [{ translateY: 1 }, { scale: 0.98 }], opacity: 0.82 },
  doorSequenceRow: { width: 54, minHeight: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  doorSequence: { color: installerTheme.textFaint, fontFamily: installerTheme.fontFamilyMono, fontSize: 7 },
  selectedBeacon: {
    width: 6,
    height: 6,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.info,
    shadowColor: installerTheme.info,
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  doorElevation: {
    width: 54,
    height: 68,
    position: "relative",
    borderRadius: 4,
    borderWidth: 2,
    padding: 4,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  doorElevationSelected: {
    shadowOpacity: 0.46,
    shadowRadius: 10,
    elevation: 5,
  },
  doorElevationInset: { flex: 1, borderRadius: 2, borderWidth: 1, backgroundColor: installerTheme.shellOverlayFaint },
  doorHinge: { position: "absolute", start: 3, width: 2, height: 7, borderRadius: 1, backgroundColor: installerTheme.textFaint },
  doorHingeTop: { top: 16 },
  doorHingeBottom: { bottom: 12 },
  doorStatusBeacon: { position: "absolute", top: 4, start: 4, width: 17, height: 17, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill },
  miniDoorHandle: { position: "absolute", end: 7, top: 34, width: 4, height: 4, borderRadius: installerTheme.radius.pill },
  doorThreshold: { position: "absolute", start: 3, end: 3, bottom: 3, height: 2, backgroundColor: installerTheme.shellBorder },
  issueFlag: { position: "absolute", top: -6, end: -6, width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill, borderWidth: 2, borderColor: installerTheme.card, backgroundColor: installerTheme.dangerFill },
  doorTileNumber: { maxWidth: "100%", color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 9, lineHeight: 12, marginTop: 4 },
  doorTilePosition: { maxWidth: "100%", color: installerTheme.textMuted, fontSize: 7, lineHeight: 10, marginTop: 1 },
  doorGroundLight: { width: 44, height: 2, borderRadius: installerTheme.radius.pill, opacity: 0.28, marginTop: 5 },
  doorGroundLightSelected: { width: 56, height: 3, opacity: 1 },
  doorDetail: {
    position: "relative",
    overflow: "hidden",
    paddingStart: 16,
    borderColor: installerTheme.borderStrong,
    backgroundColor: installerTheme.shellRaised,
  },
  doorDetailStrip: { position: "absolute", top: 0, bottom: 0, start: 0, width: 4 },
  doorImageHero: {
    position: "relative",
    height: 240,
    overflow: "hidden",
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
  },
  doorImageContent: {
    position: "absolute",
    start: 14,
    end: 14,
    bottom: 13,
  },
  doorImageTitleRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 4 },
  doorHero: { flexDirection: "row", alignItems: "center", gap: 12 },
  doorGlyph: {
    width: 54,
    height: 72,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: installerTheme.doorMaterial,
    padding: 5,
    shadowColor: installerTheme.accent,
    shadowOpacity: 0.15,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  doorGlyphInset: { flex: 1, borderRadius: 2, borderWidth: 1, borderColor: installerTheme.doorMaterialInset },
  doorGlyphStatus: {
    position: "absolute",
    top: 5,
    start: 5,
    width: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
  },
  doorHandle: { position: "absolute", end: 8, top: 34, width: 4, height: 4, borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.accent },
  doorGlyphThreshold: { position: "absolute", start: 4, end: 4, bottom: 3, height: 2, backgroundColor: installerTheme.shellBorder },
  doorHeroBody: { flex: 1, minWidth: 0 },
  doorEyebrow: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMedium, fontSize: 9, letterSpacing: 0, textTransform: "uppercase" },
  doorNumber: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplayStrong, fontSize: 27, lineHeight: 33 },
  doorType: { color: installerTheme.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  doorBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  doorFacts: { flexDirection: "row", flexWrap: "wrap", gap: 1, overflow: "hidden", borderRadius: installerTheme.radius.card, backgroundColor: installerTheme.border, marginTop: 13 },
  doorFact: { width: "33%", flexGrow: 1, minWidth: 90, backgroundColor: installerTheme.card, padding: 9 },
  doorFactLabel: { color: installerTheme.textMuted, fontSize: 8, fontWeight: "700", textTransform: "uppercase" },
  doorFactValue: { color: installerTheme.text, fontSize: 10, fontWeight: "800", marginTop: 3 },
  selectedIssue: { flexDirection: "row", gap: 9, borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: installerTheme.dangerBorder, backgroundColor: installerTheme.dangerSoft, padding: 10, marginTop: 11 },
  selectedIssueBody: { flex: 1, minWidth: 0 },
  selectedIssueTitle: { color: installerTheme.danger, fontSize: 11, fontWeight: "800" },
  selectedIssueText: { color: installerTheme.text, fontSize: 10, lineHeight: 15, marginTop: 3 },
  lockedBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: installerTheme.border, backgroundColor: installerTheme.card, padding: 11, marginTop: 12 },
  lockedText: { flex: 1, color: installerTheme.textMuted, fontSize: 10, lineHeight: 15 },
  doorActionDeck: {
    borderTopWidth: 1,
    borderTopColor: installerTheme.shellBorderSoft,
    marginTop: 13,
    paddingTop: 12,
  },
  actionDeckHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  actionDeckIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.md,
    borderWidth: 1,
    borderColor: installerTheme.infoBorder,
    backgroundColor: installerTheme.primarySoft,
  },
  actionDeckHeading: { flex: 1, minWidth: 0 },
  actionDeckEyebrow: { color: installerTheme.textFaint, fontFamily: installerTheme.fontFamilyMono, fontSize: 7 },
  actionDeckTitle: { color: installerTheme.text, fontSize: 11, fontWeight: "800", marginTop: 2 },
  offlineReady: { flexDirection: "row", alignItems: "center", gap: 4 },
  offlineReadyDot: {
    width: 6,
    height: 6,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.successFill,
    shadowColor: installerTheme.successFill,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  offlineReadyText: { color: installerTheme.success, fontFamily: installerTheme.fontFamilyMono, fontSize: 7 },
  notInstalledPanel: {
    borderTopWidth: 1,
    borderTopColor: installerTheme.dangerBorder,
    marginTop: 12,
    paddingTop: 12,
  },
  notInstalledHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  notInstalledHeading: { flex: 1, minWidth: 0 },
  notInstalledTitle: { color: installerTheme.text, fontSize: 12, fontWeight: "800" },
  notInstalledMeta: { color: installerTheme.danger, fontFamily: installerTheme.fontFamilyMono, fontSize: 8, marginTop: 3 },
  reasonCode: { color: installerTheme.textFaint, fontSize: 9, marginTop: 6 },
  doorActions: { flexDirection: "row", gap: 7, marginTop: 11 },
  reportButton: { marginTop: 9 },
  updatedText: { color: installerTheme.textFaint, fontSize: 9, textAlign: "center", marginTop: 9 },
  addonInputs: { flexDirection: "row", gap: 8, marginBottom: 10 },
  qtyInput: { width: 105 },
  emptyCopy: { color: installerTheme.textMuted, fontSize: 11, lineHeight: 16, marginTop: 10 },
  factList: { marginTop: 10 },
  factRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  factIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.purpleSoft },
  factBody: { flex: 1, minWidth: 0 },
  factTitle: { color: installerTheme.text, fontSize: 11, fontWeight: "800" },
  factMeta: { color: installerTheme.textMuted, fontSize: 9, marginTop: 3 },
  factComment: { color: installerTheme.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  queueSummary: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  pendingRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 8 },
  pendingBody: { flex: 1, minWidth: 0 },
  pendingTitle: { color: installerTheme.text, fontSize: 11, fontWeight: "800" },
  pendingMeta: { color: installerTheme.textMuted, fontSize: 9, marginTop: 3 },
  syncActions: { flexDirection: "row", gap: 7, marginTop: 10 },
  flex: { flex: 1 },
  pressed: { opacity: 0.68 },
});
