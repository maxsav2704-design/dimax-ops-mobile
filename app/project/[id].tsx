import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, StyleSheet, TextInput, View } from "react-native";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import { AnimatedFill, Pop, Reveal, useReducedMotion } from "@/components/motion";
import {
  ActionButton,
  AnimatedNumber,
  BrandText as Text,
  IconButton,
  MetricTile,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { currentLocalDateKey } from "@/lib/date-key";
import { NetworkError } from "@/lib/errors";
import { triggerHaptic, type HapticSignal } from "@/lib/haptics";
import { translateEnum } from "@/lib/i18n";
import { installerTheme, toneColors, type InstallerTone } from "@/lib/theme";
import { addAddonFact, markDoorInstalled, markDoorNotInstalled } from "@/modules/doors/actions";
import { buildProjectEarningsContext } from "@/modules/earnings/presentation";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";
import { buildWorkPrice } from "@/modules/prices/presentation";
import { WorkPriceReadout } from "@/modules/prices/WorkPriceReadout";
import {
  buildProjectExternalActions,
  openProjectExternalAction,
  type ProjectExternalAction,
} from "@/modules/projects/external-actions";
import { buildAddonFactActionState, buildDoorActionState } from "@/modules/projects/door-action-state";
import { CompletionCard } from "@/components/celebration";
import { FloorHeatmap } from "@/components/floor-heatmap";
import { Sparkline } from "@/components/sparkline";
import { buildRecentDailyTotals } from "@/modules/earnings/daily-series";
import { detectCompletionEvents, nextOpenFloor, type CompletionEvent } from "@/modules/projects/completion-events";
import { countDoorsOpenForWork, findNextDoor, isDoorOpenForWork } from "@/modules/projects/door-walkthrough";
import { DoorDetailCard } from "@/modules/projects/ui/door-detail-card";
import { DoorExplorer } from "@/modules/projects/ui/door-explorer";
import { FilterChip } from "@/modules/projects/ui/filter-chip";
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
import { useAuth, useI18n } from "@/providers/AppProviders";

type IssueFilter = "OPEN" | "ALL";
type ProjectActionTarget = "door" | "addon" | "sync";
type ProjectActionFeedback = {
  projectId: string;
  target: ProjectActionTarget;
  doorId?: string;
  tone: "success" | "danger" | "warning";
  message: string;
};
const EMPTY_LOCAL_PROJECT_WORKSPACE = createEmptyLocalProjectWorkspace();

export default function ProjectDetailsScreen() {
  const reducedMotion = useReducedMotion();
  // The door card lives in a bottom sheet; selection (list highlight) and opening are separate.
  const [doorSheetOpen, setDoorSheetOpen] = useState(false);
  const closeDoorSheet = () => setDoorSheetOpen(false);
  // Parallax: the header drifts at 40% of the scroll so the body appears to slide over it.
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const headerParallax = reducedMotion ? undefined : {
    transform: [{ translateY: scrollY.interpolate({ inputRange: [0, 200], outputRange: [0, 80], extrapolate: "clamp" }) }],
    opacity: scrollY.interpolate({ inputRange: [0, 180], outputRange: [1, 0.25], extrapolate: "clamp" }),
  };
  const { locale } = useI18n();
  const { syncVersion } = useAuth();
  const params = useLocalSearchParams<{
    id: string;
    doorId?: string;
    issueStatus?: string;
    doorSearch?: string;
    doorStatus?: string;
    orderNumber?: string;
    locationCode?: string;
  }>();
  const projectId = typeof params.id === "string" ? params.id : "";
  const requestedDoorId = typeof params.doorId === "string" ? params.doorId.trim() : "";
  const appliedDoorRequest = useRef("");
  const initialDoorSearch = typeof params.doorSearch === "string" ? params.doorSearch.trim().toLowerCase() : "";
  const activeProjectId = useRef(projectId);
  activeProjectId.current = projectId;
  const localLoadRevision = useRef(0);
  const reloadRevision = useRef(0);
  const focused = useRef(false);
  const actionInFlight = useRef(false);
  const lt = useCallback((en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en), [locale]);
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
    factoryPrices,
  } = activeWorkspace;
  const [earningsState, setEarningsState] = useState<InstallerEarningsViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [selectedDoorId, setSelectedDoorId] = useState("");
  const openDoor = (doorId: string) => {
    if (actionInFlight.current) return;
    setSelectedDoorId(doorId);
    setDoorSheetOpen(true);
  };
  const [doorSearch, setDoorSearch] = useState("");
  const [doorStatusFilter, setDoorStatusFilter] = useState("ALL");
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("ALL");
  const [selectedLocationCode, setSelectedLocationCode] = useState("ALL");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showProjectIssues, setShowProjectIssues] = useState(false);
  const [showProgressDetails, setShowProgressDetails] = useState(false);
  const [focusedFloor, setFocusedFloor] = useState("ALL");
  const autoFocusedProjectId = useRef("");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("OPEN");
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [doorComment, setDoorComment] = useState("");
  const [showNotInstalledForm, setShowNotInstalledForm] = useState(false);
  const [addonTypeId, setAddonTypeId] = useState("");
  const [addonQty, setAddonQty] = useState("1");
  const [addonComment, setAddonComment] = useState("");
  const [activeAction, setActiveAction] = useState<ProjectActionTarget | null>(null);
  const busy = activeAction !== null;
  const [actionFeedback, setActionFeedback] = useState<ProjectActionFeedback | null>(null);
  // Completion moments fire only for a floor/project the installer just finished, never on load or sync.
  const [celebration, setCelebration] = useState<{ event: CompletionEvent } | null>(null);
  const previousDoors = useRef<InstallerDoor[]>([]);
  const celebrationArmed = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocalProjectDetails = useCallback(async () => {
    const requestedProjectId = projectId;
    const revision = ++localLoadRevision.current;
    const workspace = await loadLocalProjectWorkspace(requestedProjectId);
    const pendingEventCount =
      (workspace.queueSummary?.pending || 0) + (workspace.queueSummary?.failed || 0);
    if (
      !focused.current || activeProjectId.current !== requestedProjectId ||
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
    const doorRequest = `${projectId}:${requestedDoorId}`;
    const newDoorRequest = appliedDoorRequest.current !== doorRequest;
    appliedDoorRequest.current = doorRequest;
    setSelectedDoorId((current) => {
      if (requestedDoorId && (newDoorRequest || !workspace.doors.some((door) => door.id === current))) {
        return workspace.doors.some((door) => door.id === requestedDoorId) ? requestedDoorId : "";
      }
      if (workspace.doors.some((door) => door.id === current)) return current;
      const matched = initialDoorSearch
        ? workspace.doors.find((door) => door.unit_label.toLowerCase().includes(initialDoorSearch))
        : null;
      return matched?.id || workspace.issues[0]?.door_id || workspace.doors[0]?.id || "";
    });

    return pendingEventCount;
  }, [initialDoorSearch, projectId, requestedDoorId]);

  const reload = useCallback(async ({ refreshRemote = true }: { refreshRemote?: boolean } = {}) => {
    if (!projectId) return;
    const revision = ++reloadRevision.current;
    const isCurrent = () => focused.current && activeProjectId.current === projectId && reloadRevision.current === revision;

    const pendingEventCount = await loadLocalProjectDetails();
    if (!refreshRemote || !isCurrent()) return;

    let refreshed = false;
    if (canRefreshProjectDetails(pendingEventCount)) {
      try {
        await refreshProjectDetails(projectId);
        refreshed = true;
      } catch (reason) {
        if (!isCurrent()) return;
        if (isProjectAccessRevoked(reason)) {
          try {
            await runSync({ forceRetry: true });
            await loadLocalProjectDetails();
          } catch {
            // The confirmed access response still requires hiding stale in-memory data.
          }
          if (isCurrent()) {
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

    if (!isCurrent()) return;
    if (refreshed) {
      await loadLocalProjectDetails();
    }
    if (!isCurrent()) return;
    const earnings = await loadInstallerEarnings("month", currentLocalDateKey());
    if (isCurrent()) setEarningsState(earnings);
  }, [loadLocalProjectDetails, lt, projectId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    focused.current = true;
    setError(null);
    void reload({ refreshRemote: !actionInFlight.current }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : lt("Unable to load project", "Не удалось загрузить проект", "לא ניתן לטעון את הפרויקט"));
    });
    return () => {
      active = false;
      focused.current = false;
      localLoadRevision.current += 1;
      reloadRevision.current += 1;
    };
  }, [lt, projectId, reload, syncVersion]));

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

  const issueDoorIds = useMemo(
    () => new Set(issues.filter((issue) => issue.status !== "CLOSED").map((issue) => issue.door_id)),
    [issues]
  );
  const selectedDoor = doors.find((door) => door.id === selectedDoorId) || null;
  // A door link opens the sheet once; closing it must not reopen on later layout or sync updates.
  const linkedDoorRequest = requestedDoorId && selectedDoor?.id === requestedDoorId
    ? `${projectId}:${requestedDoorId}` : "";
  const openedLinkedDoor = useRef("");
  useEffect(() => {
    if (!requestedDoorId) openedLinkedDoor.current = "";
    if (!linkedDoorRequest || openedLinkedDoor.current === linkedDoorRequest || !focused.current) return;
    openedLinkedDoor.current = linkedDoorRequest;
    setDoorSheetOpen(true);
  }, [linkedDoorRequest, requestedDoorId]);
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
  const doorPrice = selectedDoor ? buildWorkPrice({
    prices: factoryPrices,
    kind: "DOOR",
    targetId: selectedDoor.door_type_id,
    locale,
    completed: selectedDoor.status === "INSTALLED",
    pending: selectedDoorPendingEvents.find((event) =>
      event.type === "DOOR_SET_STATUS" && event.payload.status === "INSTALLED"),
  }) : null;
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
  // Walkthrough order is exactly what the installer sees: floors in order, doors within each floor.
  const walkthroughDoors = useMemo(() => displayedFloorGroups.flatMap(([, floorDoors]) => floorDoors), [displayedFloorGroups]);
  const nextDoor = useMemo(() => (selectedDoorId ? findNextDoor(walkthroughDoors, selectedDoorId) : null), [selectedDoorId, walkthroughDoors]);
  const doorsLeftInView = useMemo(() => countDoorsOpenForWork(walkthroughDoors), [walkthroughDoors]);

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
  const openIssueCount = issues.filter((issue) => issue.status !== "CLOSED").length;
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
  const selectedAddonType = addonTypes.find((addon) => addon.id === addonTypeId);
  const addonPrice = selectedAddonType ? buildWorkPrice({
    prices: factoryPrices, kind: "ADDON", targetId: selectedAddonType.id,
    locale, quantity: addonQty, unit: selectedAddonType.unit,
  }) : null;
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

  const performAction = async (
    target: ProjectActionTarget,
    action: () => Promise<unknown>,
    onSaved?: () => void,
    doorId?: string,
    savedSignal: HapticSignal = "success",
  ) => {
    // State alone cannot block a second press in the same render frame.
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    reloadRevision.current += 1;
    localLoadRevision.current += 1;
    setActiveAction(target);
    setError(null);
    setActionFeedback(null);
    const isCurrent = () => activeProjectId.current === projectId && focused.current;
    const savedMessage = target === "sync"
      ? lt("Sync finished. Check the queue for pending or rejected actions.", "Обмен завершён. Проверьте в очереди ожидающие и отклонённые действия.", "הסנכרון הסתיים. בדקו בתור פעולות ממתינות או שנדחו.")
      : lt("Saved on this device. Delivery status is in the sync queue.", "Сохранено на устройстве. Статус отправки доступен в очереди.", "נשמר במכשיר. מצב השליחה מופיע בתור הסנכרון.");
    try {
      await action();
      if (activeProjectId.current !== projectId) return;
      onSaved?.();
      setActionFeedback({ projectId, target, doorId, tone: "success", message: savedMessage });
      void triggerHaptic(savedSignal);
      if (!focused.current) return;
      try {
        await reload({ refreshRemote: target === "sync" });
      } catch {
        void triggerHaptic("warning");
        if (isCurrent()) setActionFeedback({
          projectId, target, doorId, tone: "warning",
          message: `${savedMessage} ${lt("Could not refresh the view. Do not submit this work again.", "Не удалось обновить экран. Не сохраняйте эту работу повторно.", "לא ניתן לרענן את התצוגה. אין לשמור עבודה זו שוב.")}`,
        });
      }
    } catch (reason) {
      void triggerHaptic("error");
      if (isCurrent()) setActionFeedback({
        projectId, target, doorId, tone: "danger",
        message: reason instanceof Error ? reason.message : lt("Action failed. Please try again.", "Действие не выполнено. Попробуйте ещё раз.", "הפעולה נכשלה. נסו שוב."),
      });
    } finally {
      actionInFlight.current = false;
      setActiveAction(null);
    }
  };

  const handleInstall = async () => {
    if (!selectedDoor || !doorActionState?.canMarkInstalled) return;
    celebrationArmed.current = true;
    await performAction("door", () => markDoorInstalled(projectId, selectedDoor.id), undefined, selectedDoor.id);
  };

  useEffect(() => {
    previousDoors.current = [];
    celebrationArmed.current = false;
    setCelebration(null);
  }, [projectId]);
  useEffect(() => {
    const previous = previousDoors.current;
    previousDoors.current = doors;
    if (!celebrationArmed.current || previous === doors) return;
    celebrationArmed.current = false;
    const [event] = detectCompletionEvents(previous, doors);
    if (!event) return;
    setCelebration({ event });
    setDoorSheetOpen(false);
    // Bring the moment into view: the card sits at the top of the body.
    scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion });
    void triggerHaptic("success");
    setTimeout(() => void triggerHaptic("tap"), 160);
  }, [doors]);
  const celebrationFloorKey = celebration?.event.kind === "floor"
    ? celebration.event.floor || lt("No floor", "Без этажа", "ללא קומה") : null;
  const celebrationNextFloor = celebrationFloorKey !== null ? nextOpenFloor(groupedDoors, celebrationFloorKey) : null;
  const goToCelebrationNextFloor = () => {
    if (!celebrationNextFloor) return;
    setFocusedFloor(celebrationNextFloor);
    const first = groupedDoors.find(([floor]) => floor === celebrationNextFloor)?.[1].find(isDoorOpenForWork);
    if (first) setSelectedDoorId(first.id);
    setCelebration(null);
  };

  const handleNotInstalled = async () => {
    if (!selectedDoor || !doorActionState?.canMarkNotInstalled) return;
    await performAction("door", () => markDoorNotInstalled(projectId, selectedDoor.id, selectedReasonId, doorComment), () => {
      setDoorComment("");
      setShowNotInstalledForm(false);
    }, selectedDoor.id, "warning");
  };

  const handleAddonFact = async () => {
    const qtyDone = addonActionState.normalizedQtyDone;
    if (!addonActionState.canQueueAddonFact || !qtyDone) return;
    await performAction("addon", () => addAddonFact(projectId, addonTypeId, qtyDone, addonComment), () => {
      setAddonQty("1");
      setAddonComment("");
    });
  };

  const handleSync = () => performAction("sync", () => runSync({ forceRetry: true }));

  const renderActionFeedback = (target: ProjectActionTarget) => {
    if (!actionFeedback || actionFeedback.projectId !== projectId || actionFeedback.target !== target) return null;
    if (target === "door" && actionFeedback.doorId !== selectedDoorId) return null;
    const colors = toneColors(actionFeedback.tone);
    return (
      <View testID={`project-action-${target}`} accessibilityLiveRegion="polite" style={[styles.actionFeedback, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <View style={styles.actionFeedbackMessage}>
          <Pop>
            <Ionicons name={actionFeedback.tone === "success" ? "checkmark-circle" : "alert-circle-outline"} size={18} color={colors.text} />
          </Pop>
          <Text style={styles.actionFeedbackText}>{actionFeedback.message}</Text>
        </View>
        <ActionButton label={lt("Open queue", "Открыть очередь", "פתיחת התור")} icon="list-outline" variant="secondary" onPress={() => router.push("/sync-queue" as never)} />
      </View>
    );
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
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <Animated.View style={[styles.projectHeader, headerParallax]}>
          <View style={styles.projectHeadingRow}>
            <IconButton icon={locale === "he" ? "arrow-forward" : "arrow-back"} label={lt("Back", "Назад", "חזרה")} tone="dark" onPress={() => router.back()} />
            <View style={styles.projectHeading}>
              <Text style={styles.projectEyebrow}>{lt("PROJECT / DOORS", "ОБЪЕКТ / ДВЕРИ", "פרויקט / דלתות")}</Text>
              <Text style={styles.projectTitle} accessibilityRole="header">{project?.name || lt("Project", "Объект", "פרויקט")}</Text>
              <Text style={styles.projectAddress}>{project?.address || lt("No address", "Адрес не указан", "לא הוגדרה כתובת")}</Text>
            </View>
            <IconButton icon="sync" label={lt("Sync now", "Синхронизировать", "סנכרון")} tone="dark" disabled={busy} onPress={() => void handleSync()} />
          </View>
          <View style={styles.heroBadges}>
            <StatusPill label={translateEnum(locale, project?.status || "ACTIVE")} tone="accent" />
            <StatusPill
              label={`${pendingEvents.length} ${lt("queued", "в очереди", "בתור")}`}
              tone={queueSummary?.blocked ? "danger" : pendingEvents.length ? "warning" : "success"}
              icon={pendingEvents.length ? "cloud-upload-outline" : "cloud-done-outline"}
            />
          </View>
        </Animated.View>

        <View style={styles.body}>
          {requestedDoorId && localWorkspace?.projectId === projectId && !doors.some((door) => door.id === requestedDoorId) ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>{lt("The linked door is no longer assigned. Another door was not selected automatically.", "Связанная дверь больше не назначена. Другая дверь не выбрана автоматически.", "הדלת המקושרת כבר אינה משויכת. דלת אחרת לא נבחרה אוטומטית.")}</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {renderActionFeedback("sync")}
          {celebration ? (
            <CompletionCard
              testID="project-celebration"
              title={celebration.event.kind === "project"
                ? lt("Project complete", "Объект завершён", "הפרויקט הושלם")
                : lt(`Floor ${celebrationFloorKey} complete`, `Этаж ${celebrationFloorKey} завершён`, `קומה ${celebrationFloorKey} הושלמה`)}
              summary={`${celebration.event.installed} / ${celebration.event.total} ${lt("doors installed", "дверей установлено", "דלתות הותקנו")}`}
              nextLabel={celebrationNextFloor ? `${lt("Next floor", "К следующему этажу", "לקומה הבאה")}: ${celebrationNextFloor}` : null}
              onNext={celebrationNextFloor ? goToCelebrationNextFloor : undefined}
              closeLabel={lt("Dismiss", "Закрыть", "סגירה")}
              onClose={() => setCelebration(null)}
            />
          ) : null}

          <SectionCard style={styles.progressCard}>
            <View style={styles.accentStrip} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={lt("Door progress", "Прогресс дверей", "התקדמות דלתות")}
              accessibilityState={{ expanded: showProgressDetails }}
              onPress={() => setShowProgressDetails((value) => !value)}
              style={styles.progressHeader}
            >
              <Text style={styles.progressEyebrow}>{lt("Installed", "Установлено", "הותקן")}</Text>
              <Text style={styles.progressValue}><AnimatedNumber value={completion.installed} /> <Text style={styles.progressTotal}>/ {completion.total}</Text></Text>
              <StatusPill label={`${completion.percent}%`} value={completion.percent} format={(current) => `${Math.round(current)}%`} tone={completion.percent === 100 ? "success" : "accent"} />
              <Ionicons name={showProgressDetails ? "chevron-up" : "chevron-down"} size={14} color={installerTheme.textMuted} />
            </Pressable>
            <View style={styles.progressTrack}>
              <AnimatedFill percent={completion.percent} style={styles.progressFill} />
            </View>
            {showProgressDetails ? <Reveal style={styles.legend}>
              <LegendDot color={installerTheme.successFill} label={lt("Installed", "Установлено", "הותקן")} value={completion.installed} />
              <LegendDot color={installerTheme.warningFill} label={lt("Not installed", "Не установлено", "לא הותקן")} value={completion.notInstalled} />
              <LegendDot color={installerTheme.dangerFill} label={lt("Issues", "Проблемы", "תקלות")} value={completion.problem} />
              <LegendDot color={installerTheme.textFaint} label={lt("Locked", "Заблокировано", "נעול")} value={completion.locked} />
            </Reveal> : null}
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={lt("Project issues", "Проблемы объекта", "תקלות בפרויקט")}
                accessibilityState={{ expanded: showProjectIssues }}
                onPress={() => setShowProjectIssues((value) => !value)}
                style={styles.issueToggle}
              >
                <Ionicons name="alert-circle-outline" size={20} color={installerTheme.danger} />
                <Text style={styles.issueToggleLabel}>{lt("Project issues", "Проблемы объекта", "תקלות בפרויקט")}</Text>
                <StatusPill label={`${lt("Open", "Открыто", "פתוחות")}: ${openIssueCount}`} tone={openIssueCount ? "danger" : "neutral"} />
                <Ionicons name={showProjectIssues ? "chevron-up" : "chevron-down"} size={16} color={installerTheme.textMuted} />
              </Pressable>
              {showProjectIssues ? <Reveal>
                <SectionHeader
                  title={lt("Issues", "Проблемы", "תקלות")}
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
                        disabled={busy}
                        accessibilityLabel={`${issue.title || lt("Reported issue", "Заявленная проблема", "תקלה שדווחה")}. ${issueDoor?.unit_label || lt("Door", "Дверь", "דלת")}`}
                        onPress={() => {
                          openDoor(issue.door_id);
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
                <ActionButton
                  label={lt("All project issues", "Все проблемы объекта", "כל התקלות בפרויקט")}
                  icon="list-outline"
                  variant="secondary"
                  onPress={() => router.push(`/issues?projectId=${encodeURIComponent(projectId)}` as never)}
                />
              </Reveal> : null}
            </SectionCard>
          ) : null}

          <View>
            <View style={styles.searchRow}>
              <View style={styles.searchField}>
                <Ionicons name="search-outline" size={18} color={installerTheme.textMuted} />
                <TextInput
                  value={doorSearch}
                  onChangeText={setDoorSearch}
                  accessibilityLabel={lt("Search doors", "Поиск дверей", "חיפוש דלתות")}
                  placeholder={lt("Door, order, apartment…", "Дверь, заказ, квартира…", "דלת, הזמנה, דירה…")}
                  placeholderTextColor={installerTheme.textFaint}
                  style={styles.searchInput}
                />
              </View>
              {orderNumbers.length > 1 || locationCodes.length > 1 || selectedOrderNumber !== "ALL" || selectedLocationCode !== "ALL" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={lt("Advanced filters", "Дополнительные фильтры", "מסננים נוספים")}
                  accessibilityState={{ expanded: showAdvancedFilters }}
                  onPress={() => setShowAdvancedFilters((value) => !value)}
                  style={[styles.filterToggle, showAdvancedFilters && styles.chipActive]}
                >
                  <Ionicons name="options-outline" size={20} color={installerTheme.info} />
                  {selectedOrderNumber !== "ALL" || selectedLocationCode !== "ALL" ? <View style={styles.activeFilterDot} /> : null}
                </Pressable>
              ) : null}
            </View>
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
            {showAdvancedFilters && orderNumbers.length > 1 ? (
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
            {showAdvancedFilters && locationCodes.length > 1 ? (
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
          </View>

          {groupedDoors.length ? (
            <SectionCard>
              <SectionHeader title={lt("Floor map", "Карта этажей", "מפת קומות")} meta={doors.length} />
              <FloorHeatmap
                floors={groupedDoors}
                selectedDoorId={selectedDoorId}
                issueDoorIds={issueDoorIds}
                busy={busy}
                locale={locale}
                onOpenDoor={openDoor}
                testID="project-floor-map"
              />
            </SectionCard>
          ) : null}

          <DoorExplorer
            lt={lt}
            locale={locale}
            filteredCount={filteredDoors.length}
            totalCount={doors.length}
            groupedDoors={groupedDoors}
            displayedFloorGroups={displayedFloorGroups}
            focusedFloor={focusedFloor}
            onFocusFloor={(floor, firstDoorId) => {
              setFocusedFloor(floor);
              if (firstDoorId !== undefined) setSelectedDoorId(firstDoorId);
            }}
            selectedDoorId={selectedDoorId}
            celebrateDoorId={actionFeedback?.tone === "success" && actionFeedback.target === "door" ? actionFeedback.doorId ?? null : null}
            busy={busy}
            issueDoorIds={issueDoorIds}
            doorTypes={doorTypes}
            onOpenDoor={openDoor}
            onResetFilters={resetFilters}
          />

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
                      disabled={busy}
                      label={`${addon.name}${addon.qty_planned ? ` · ${addon.qty_planned} ${addon.unit}` : ""}`}
                      onPress={() => setAddonTypeId(addon.id)}
                    />
                  ))}
                </ScrollView>
                <View style={styles.addonInputs}>
                  <TextInput
                    value={addonQty}
                    editable={!busy}
                    onChangeText={setAddonQty}
                    accessibilityLabel={lt("Completed quantity", "Выполненное количество", "כמות שבוצעה")}
                    placeholder={lt("Quantity…", "Количество…", "כמות…")}
                    placeholderTextColor={installerTheme.textFaint}
                    keyboardType="decimal-pad"
                    style={[styles.input, styles.qtyInput]}
                  />
                  <TextInput
                    value={addonComment}
                    editable={!busy}
                    onChangeText={setAddonComment}
                    accessibilityLabel={lt("Add-on comment", "Комментарий к допработе", "הערה לעבודה נוספת")}
                    placeholder={lt("Comment…", "Комментарий…", "הערה…")}
                    placeholderTextColor={installerTheme.textFaint}
                    style={[styles.input, styles.addonCommentInput]}
                  />
                </View>
                {addonPrice ? <WorkPriceReadout testID="addon-work-price" price={addonPrice} /> : null}
                <ActionButton
                  label={lt("Save completed add-on", "Сохранить допработу", "שמירת עבודה נוספת")}
                  icon="add"
                  loading={activeAction === "addon"}
                  disabled={!addonActionState.canQueueAddonFact}
                  onPress={() => void handleAddonFact()}
                />
              </>
            ) : (
              <Text style={styles.emptyCopy}>{lt("No add-on catalog is assigned to this project.", "Для объекта не назначен каталог допработ.", "לא הוגדר קטלוג עבודות נוספות לפרויקט.")}</Text>
            )}
            {renderActionFeedback("addon")}
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
              onPress={() => router.push(`/earnings?project_id=${encodeURIComponent(projectId)}&focus=TODAY` as never)}
              value={projectEarnings ? `${projectEarnings.todayTotal} ${projectEarnings.currency}` : "—"}
              meta={lt("Accrued for this project", "Начислено по объекту", "נצבר בפרויקט")}
              tone="success"
            />
            <MetricTile
              label={lt("Month pay", "Заработок за месяц", "שכר חודשי")}
              onPress={() => router.push(`/earnings?project_id=${encodeURIComponent(projectId)}&focus=MONTH` as never)}
              value={projectEarnings ? `${projectEarnings.monthTotal} ${projectEarnings.currency}` : "—"}
              meta={`${projectEarnings?.rows.length || 0} ${lt("work rows", "строк работ", "שורות עבודה")}`}
              tone="accent"
            >
              {projectEarnings ? (
                <Sparkline
                  points={buildRecentDailyTotals(projectEarnings.rows, currentLocalDateKey(), 7)}
                  color={installerTheme.accent}
                  style={styles.paySparkline}
                  testID="project-pay-sparkline"
                />
              ) : null}
            </MetricTile>
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
                loading={activeAction === "sync"}
                disabled={busy || !pendingEvents.length}
                style={styles.actionButtonSlot}
                onPress={() => void handleSync()}
              />
              <ActionButton
                label={lt("Open queue", "Открыть очередь", "פתיחת התור")}
                icon="list-outline"
                variant="secondary"
                style={styles.actionButtonSlot}
                onPress={() => router.push("/sync-queue" as never)}
              />
            </View>
            {renderActionFeedback("sync")}
          </SectionCard>
        </View>
      </Animated.ScrollView>
      {selectedDoor && doorSheetOpen ? (
        <Modal visible transparent statusBarTranslucent animationType={reducedMotion ? "none" : "slide"} onRequestClose={closeDoorSheet}>
          <SafeAreaView style={[styles.sheetRoot, { direction: locale === "he" ? "rtl" : "ltr" }]} edges={["top", "bottom", "left", "right"]}>
            <Pressable
              feedback="none"
              accessibilityRole="button"
              accessibilityLabel={lt("Close door card", "Закрыть карточку двери", "סגירת כרטיס הדלת")}
              style={styles.sheetBackdrop}
              onPress={closeDoorSheet}
            />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetPanelWrap}>
              <View testID="project-door-details" accessibilityViewIsModal onAccessibilityEscape={closeDoorSheet} style={styles.sheetPanel}>
                <View style={styles.sheetGrip} />
                <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <DoorDetailCard
                    door={selectedDoor}
                    doorType={selectedDoorType}
                    issues={selectedDoorIssues}
                    pendingEvents={selectedDoorPendingEvents}
                    doorPrice={doorPrice}
                    doorActionState={doorActionState}
                    lt={lt}
                    locale={locale}
                    projectId={projectId}
                    busy={busy}
                    activeAction={activeAction}
                    showNotInstalledForm={showNotInstalledForm}
                    setShowNotInstalledForm={setShowNotInstalledForm}
                    reasons={reasons}
                    selectedReasonId={selectedReasonId}
                    setSelectedReasonId={setSelectedReasonId}
                    selectedReason={selectedReason}
                    doorComment={doorComment}
                    setDoorComment={setDoorComment}
                    onInstall={() => void handleInstall()}
                    onNotInstalled={() => void handleNotInstalled()}
                    onBackToList={closeDoorSheet}
                    onOpenDoor={openDoor}
                    nextDoor={nextDoor}
                    doorsLeftInView={doorsLeftInView}
                    feedback={renderActionFeedback("door")}
                    formatDateTime={formatDateTime}
                  />
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      ) : null}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  paySparkline: { marginTop: 8, alignSelf: "flex-start" },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.66)" },
  sheetPanelWrap: { maxHeight: "92%" },
  sheetPanel: {
    flexShrink: 1,
    paddingTop: 8,
    borderTopStartRadius: installerTheme.radius.glass,
    borderTopEndRadius: installerTheme.radius.glass,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: installerTheme.borderStrong,
    backgroundColor: installerTheme.background,
  },
  sheetGrip: { alignSelf: "center", width: 40, height: 4, borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.borderStrong, marginBottom: 6 },
  // ScrollView grows by default; keep the sheet hugging its content up to the max height.
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetBody: { paddingHorizontal: 12, paddingBottom: 16 },
  content: { flex: 1 },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  projectHeader: { padding: 16, gap: 4, borderBottomWidth: 1, borderBottomColor: installerTheme.border, marginBottom: 10 },
  projectHeadingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  projectHeading: { flex: 1, minWidth: 0 },
  projectEyebrow: { color: installerTheme.accent, fontSize: installerTheme.type.caption, lineHeight: 15, fontWeight: "700" },
  projectTitle: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 22, lineHeight: 29 },
  projectAddress: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
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
  errorText: { flex: 1, color: installerTheme.danger, fontSize: installerTheme.type.caption, lineHeight: 16 },
  actionFeedback: { borderStartWidth: 3, padding: 12, gap: 10, marginTop: 10 },
  actionFeedbackMessage: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  actionFeedbackText: { flex: 1, minWidth: 0, color: installerTheme.text, fontSize: 12, lineHeight: 18 },
  progressCard: { position: "relative", overflow: "hidden", padding: 12, paddingStart: 16 },
  accentStrip: { position: "absolute", top: 0, bottom: 0, start: 0, width: 4, backgroundColor: installerTheme.accent },
  progressHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  progressEyebrow: { flex: 1, minWidth: 0, color: installerTheme.textMuted, fontSize: 12, fontWeight: "700" },
  progressValue: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 20 },
  progressTotal: { color: installerTheme.textFaint, fontSize: 15, fontWeight: "600" },
  progressTrack: { height: 5, overflow: "hidden", borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.border, marginTop: 4 },
  progressFill: { height: "100%", borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.successFill },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16 },
  legendValue: { color: installerTheme.text, fontWeight: "800" },
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  quickAction: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: 0,
    minHeight: 44,
    flexDirection: "row",
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
  quickIcon: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill },
  quickLabel: { flexShrink: 1, color: installerTheme.text, fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "center" },
  issueSection: { borderColor: installerTheme.dangerBorder, paddingHorizontal: 10, paddingVertical: 2 },
  issueToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  issueToggleLabel: { flex: 1, minWidth: 0, color: installerTheme.text, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  issueFilter: { width: 148, maxWidth: "48%", flexShrink: 1 },
  issueList: { marginTop: 8 },
  issueRow: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  issueIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.dangerSoft },
  issueBody: { flex: 1, minWidth: 0 },
  issueTitle: { color: installerTheme.text, fontSize: installerTheme.type.caption, fontWeight: "800" },
  issueMeta: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16, marginTop: 3 },
  searchRow: { flexDirection: "row", gap: 8 },
  searchField: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, paddingHorizontal: 12, borderRadius: installerTheme.radius.md, borderWidth: 1, borderColor: installerTheme.borderStrong, backgroundColor: installerTheme.shellRaised },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 10, color: installerTheme.text, fontFamily: installerTheme.fontFamily, fontSize: 13 },
  filterToggle: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, borderWidth: 1, borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.shellRaised },
  activeFilterDot: { position: "absolute", top: 6, end: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: installerTheme.accent },
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
  chips: { gap: 7, paddingEnd: 12, marginTop: 9 },
  chipActive: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.primarySoft },
  fieldLabel: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, fontWeight: "800", textTransform: "uppercase", marginTop: 13 },
  resetButton: { marginTop: 11 },
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
  actionButtonSlot: { flexGrow: 1, flexBasis: 140 },
  addonInputs: { flexDirection: "row", gap: 8, marginBottom: 10 },
  qtyInput: { width: 105 },
  addonCommentInput: { flex: 1, minWidth: 0 },
  emptyCopy: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16, marginTop: 10 },
  factList: { marginTop: 10 },
  factRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  factIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.purpleSoft },
  factBody: { flex: 1, minWidth: 0 },
  factTitle: { color: installerTheme.text, fontSize: installerTheme.type.caption, fontWeight: "800" },
  factMeta: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, marginTop: 3 },
  factComment: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16, marginTop: 3 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  queueSummary: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  pendingRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 8 },
  pendingBody: { flex: 1, minWidth: 0 },
  pendingTitle: { color: installerTheme.text, fontSize: installerTheme.type.caption, fontWeight: "800" },
  pendingMeta: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, marginTop: 3 },
  syncActions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  flex: { flex: 1 },
  pressed: { opacity: 0.68 },
});
