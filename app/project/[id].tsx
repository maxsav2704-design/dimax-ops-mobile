import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import {
  ActionButton,
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
  getProject,
  listDoorTypes,
  listProjectAddonFacts,
  listProjectAddonTypes,
  listProjectDoors,
  listProjectIssues,
  listReasons,
} from "@/modules/projects/repository";
import { refreshProjectDetails } from "@/modules/projects/service";
import type {
  DoorTypeOption,
  InstallerDoor,
  ProjectAddonFact,
  ProjectAddonTypeOption,
  ProjectIssue,
  ProjectListItem,
} from "@/modules/projects/types";
import { getSyncQueueSummary, listPendingEvents, runSync } from "@/modules/sync/service";
import type { PendingSyncEvent, SyncQueueSummary } from "@/modules/sync/types";
import { useI18n } from "@/providers/AppProviders";

type IssueFilter = "OPEN" | "ALL";

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
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";

  const [project, setProject] = useState<ProjectListItem | null>(null);
  const [doors, setDoors] = useState<InstallerDoor[]>([]);
  const [doorTypes, setDoorTypes] = useState<DoorTypeOption[]>([]);
  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [reasons, setReasons] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [addonTypes, setAddonTypes] = useState<ProjectAddonTypeOption[]>([]);
  const [addonFacts, setAddonFacts] = useState<ProjectAddonFact[]>([]);
  const [pendingEvents, setPendingEvents] = useState<PendingSyncEvent[]>([]);
  const [queueSummary, setQueueSummary] = useState<SyncQueueSummary | null>(null);
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
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("OPEN");
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [doorComment, setDoorComment] = useState("");
  const [addonTypeId, setAddonTypeId] = useState("");
  const [addonQty, setAddonQty] = useState("1");
  const [addonComment, setAddonComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!projectId) return;
    try {
      await refreshProjectDetails(projectId);
    } catch {
      // Cached project data remains usable offline.
    }
    const [
      projectRow,
      doorRows,
      doorTypeRows,
      issueRows,
      reasonRows,
      addonTypeRows,
      addonFactRows,
      pendingRows,
      queueRow,
      earnings,
    ] = await Promise.all([
      getProject(projectId),
      listProjectDoors(projectId),
      listDoorTypes(),
      listProjectIssues(projectId),
      listReasons(),
      listProjectAddonTypes(projectId),
      listProjectAddonFacts(projectId),
      listPendingEvents(projectId),
      getSyncQueueSummary(projectId),
      loadInstallerEarnings("month", currentLocalDateKey()),
    ]);
    setProject(projectRow);
    setDoors(doorRows);
    setDoorTypes(doorTypeRows);
    setIssues(issueRows);
    setReasons(reasonRows);
    setAddonTypes(addonTypeRows);
    setAddonFacts(addonFactRows);
    setPendingEvents(pendingRows);
    setQueueSummary(queueRow);
    setEarningsState(earnings);
    setSelectedReasonId((current) =>
      reasonRows.some((reason) => reason.id === current) ? current : reasonRows[0]?.id || ""
    );
    setAddonTypeId((current) =>
      addonTypeRows.some((addon) => addon.id === current) ? current : addonTypeRows[0]?.id || ""
    );
    setSelectedDoorId((current) => {
      if (doorRows.some((door) => door.id === current)) return current;
      const search = typeof params.doorSearch === "string" ? params.doorSearch.trim().toLowerCase() : "";
      const matched = search
        ? doorRows.find((door) => door.unit_label.toLowerCase().includes(search))
        : null;
      return matched?.id || issueRows[0]?.door_id || doorRows[0]?.id || "";
    });
  };

  useEffect(() => {
    void reload();
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
  const selectedDoorType = selectedDoor
    ? doorTypes.find((doorType) => doorType.id === selectedDoor.door_type_id) || null
    : null;
  const selectedReason = reasons.find((reason) => reason.id === selectedReasonId) || null;
  const doorActionState = selectedDoor
    ? buildDoorActionState({ door: selectedDoor, busy, selectedReasonId })
    : null;
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
      await reload();
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
      await reload();
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
      await reload();
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
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
            <View style={styles.errorBox}>
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
                  <SegmentedControl
                    value={issueFilter}
                    onChange={setIssueFilter}
                    options={[
                      { value: "OPEN", label: lt("Open", "Открытые", "פתוחות") },
                      { value: "ALL", label: lt("All", "Все", "הכול") },
                    ]}
                  />
                }
              />
              <View style={styles.issueList}>
                {visibleIssues.slice(0, 5).map((issue) => {
                  const issueDoor = doors.find((door) => door.id === issue.door_id);
                  return (
                    <Pressable
                      key={issue.id}
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
            {groupedDoors.length ? groupedDoors.map(([floor, floorDoors]) => {
              const floorInstalled = floorDoors.filter((door) => door.status === "INSTALLED").length;
              return (
                <SectionCard key={floor} style={styles.floorCard}>
                  <View style={styles.floorHeader}>
                    <View>
                      <Text style={styles.floorTitle}>{lt("Floor", "Этаж", "קומה")} {floor}</Text>
                      <Text style={styles.floorMeta}>
                        {floorInstalled}/{floorDoors.length} {lt("installed", "установлено", "הותקנו")}
                      </Text>
                    </View>
                    <StatusPill
                      label={`${Math.round((floorInstalled / floorDoors.length) * 100)}%`}
                      tone={floorInstalled === floorDoors.length ? "success" : "neutral"}
                    />
                  </View>
                  <View style={styles.doorGrid}>
                    {floorDoors.map((door) => (
                      <DoorTile
                        key={door.id}
                        door={door}
                        selected={door.id === selectedDoorId}
                        hasIssue={issueDoorIds.has(door.id)}
                        locale={locale}
                        onPress={() => setSelectedDoorId(door.id)}
                      />
                    ))}
                  </View>
                </SectionCard>
              );
            }) : (
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
              <View style={styles.doorHero}>
                <View style={[styles.doorGlyph, { borderColor: doorStatusColors(selectedDoor, selectedDoorIssues.length > 0).text }]}>
                  <View style={styles.doorGlyphInset} />
                  <View style={styles.doorHandle} />
                </View>
                <View style={styles.doorHeroBody}>
                  <Text style={styles.doorNumber}>{selectedDoor.unit_label}</Text>
                  <Text style={styles.doorType} numberOfLines={2}>
                    {selectedDoorType?.name || selectedDoorType?.code || selectedDoor.door_type_id}
                  </Text>
                  <View style={styles.doorBadges}>
                    <StatusPill
                      label={translateEnum(locale, selectedDoor.status)}
                      tone={doorStatusTone(selectedDoor, selectedDoorIssues.length > 0)}
                    />
                    {selectedDoorIssues.length ? <StatusPill label={`${selectedDoorIssues.length} ${lt("issues", "проблем", "תקלות")}`} tone="danger" /> : null}
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
                  <Text style={styles.fieldLabel}>{lt("Reason if not installed", "Причина, если не установлена", "סיבה אם לא הותקנה")}</Text>
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
                      onPress={() => void handleNotInstalled()}
                    />
                  </View>
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
      <Text style={styles.legendText}><Text style={styles.legendValue}>{value}</Text> {label}</Text>
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
      <View style={[styles.quickIcon, { backgroundColor: colors.background }]}>
        <Ionicons name={icon} size={19} color={colors.text} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function DoorTile({
  door,
  selected,
  hasIssue,
  locale,
  onPress,
}: {
  door: InstallerDoor;
  selected: boolean;
  hasIssue: boolean;
  locale: "en" | "ru" | "he";
  onPress: () => void;
}) {
  const colors = doorStatusColors(door, hasIssue);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${door.unit_label}, ${translateEnum(locale, door.status)}`}
      style={({ pressed }) => [
        styles.doorTile,
        { backgroundColor: colors.background, borderColor: colors.border },
        selected && styles.doorTileSelected,
        pressed && styles.pressed,
      ]}
    >
      {hasIssue ? <View style={styles.issueFlag} /> : null}
      <Text style={[styles.doorTileNumber, { color: colors.text }]} numberOfLines={1}>{door.unit_label}</Text>
      <Text style={[styles.doorTileStatus, { color: colors.text }]} numberOfLines={1}>
        {door.status === "INSTALLED" ? "OK" : door.status === "NOT_INSTALLED" ? "NI" : door.status.slice(0, 2)}
      </Text>
    </Pressable>
  );
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
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  heroActions: { flexDirection: "row", gap: 7 },
  heroBadges: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
  body: { gap: 12, padding: 12 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: "#F5C2BC",
    backgroundColor: installerTheme.dangerSoft,
    padding: 11,
  },
  errorText: { flex: 1, color: installerTheme.danger, fontSize: 11, lineHeight: 16 },
  progressCard: { position: "relative", overflow: "hidden", paddingLeft: 18 },
  accentStrip: { position: "absolute", top: 0, bottom: 0, left: 0, width: 4, backgroundColor: installerTheme.accent },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  progressBody: { flex: 1 },
  progressEyebrow: { color: installerTheme.textMuted, fontSize: 9, fontWeight: "800" },
  progressValue: { color: installerTheme.text, fontSize: 22, fontWeight: "900", marginTop: 3, fontVariant: ["tabular-nums"] },
  progressTotal: { color: installerTheme.textFaint, fontSize: 15, fontWeight: "600" },
  progressTrack: { height: 8, overflow: "hidden", borderRadius: 999, backgroundColor: installerTheme.border, marginTop: 12 },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: installerTheme.successFill },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { color: installerTheme.textMuted, fontSize: 9 },
  legendValue: { color: installerTheme.text, fontWeight: "800" },
  quickActions: { flexDirection: "row", gap: 7 },
  quickAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    padding: 7,
  },
  quickIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  quickLabel: { color: installerTheme.text, fontSize: 9, lineHeight: 12, fontWeight: "800", textAlign: "center" },
  issueSection: { borderColor: "#F5C2BC" },
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
    backgroundColor: installerTheme.cardMuted,
    color: installerTheme.text,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  textarea: { minHeight: 86, textAlignVertical: "top" },
  chips: { gap: 7, paddingRight: 12, marginTop: 9 },
  chip: {
    maxWidth: 240,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 12,
  },
  chipActive: { borderColor: installerTheme.primary, backgroundColor: installerTheme.primary },
  chipText: { color: installerTheme.textMuted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: installerTheme.textOnDark },
  fieldLabel: { color: installerTheme.textMuted, fontSize: 9, fontWeight: "800", textTransform: "uppercase", marginTop: 13 },
  resetButton: { marginTop: 11 },
  floorSection: { gap: 8 },
  floorCard: { padding: 0, overflow: "hidden" },
  floorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottomWidth: 1, borderBottomColor: installerTheme.border, backgroundColor: installerTheme.cardMuted, padding: 12 },
  floorTitle: { color: installerTheme.text, fontSize: 13, fontWeight: "800" },
  floorMeta: { color: installerTheme.textMuted, fontSize: 9, marginTop: 3 },
  doorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, padding: 11 },
  doorTile: {
    width: 57,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    padding: 4,
    position: "relative",
  },
  doorTileSelected: { borderWidth: 2, borderColor: installerTheme.primary, transform: [{ scale: 1.04 }] },
  doorTileNumber: { maxWidth: "100%", fontSize: 10, fontWeight: "900" },
  doorTileStatus: { fontSize: 7, fontWeight: "800", marginTop: 3 },
  issueFlag: { position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: 999, borderWidth: 2, borderColor: installerTheme.card, backgroundColor: installerTheme.dangerFill },
  doorDetail: { position: "relative", overflow: "hidden", paddingLeft: 18 },
  doorDetailStrip: { position: "absolute", top: 0, bottom: 0, left: 0, width: 4 },
  doorHero: { flexDirection: "row", alignItems: "center", gap: 12 },
  doorGlyph: { width: 50, height: 65, borderRadius: 5, borderWidth: 2, backgroundColor: "#6E6258", padding: 5 },
  doorGlyphInset: { flex: 1, borderRadius: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  doorHandle: { position: "absolute", right: 8, top: 34, width: 4, height: 4, borderRadius: 999, backgroundColor: installerTheme.accent },
  doorHeroBody: { flex: 1, minWidth: 0 },
  doorNumber: { color: installerTheme.text, fontSize: 22, fontWeight: "900" },
  doorType: { color: installerTheme.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  doorBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  doorFacts: { flexDirection: "row", flexWrap: "wrap", gap: 1, overflow: "hidden", borderRadius: installerTheme.radius.card, backgroundColor: installerTheme.border, marginTop: 13 },
  doorFact: { width: "33%", flexGrow: 1, minWidth: 90, backgroundColor: installerTheme.cardMuted, padding: 9 },
  doorFactLabel: { color: installerTheme.textMuted, fontSize: 8, fontWeight: "700", textTransform: "uppercase" },
  doorFactValue: { color: installerTheme.text, fontSize: 10, fontWeight: "800", marginTop: 3 },
  selectedIssue: { flexDirection: "row", gap: 9, borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: "#F5C2BC", backgroundColor: installerTheme.dangerSoft, padding: 10, marginTop: 11 },
  selectedIssueBody: { flex: 1, minWidth: 0 },
  selectedIssueTitle: { color: installerTheme.danger, fontSize: 11, fontWeight: "800" },
  selectedIssueText: { color: installerTheme.text, fontSize: 10, lineHeight: 15, marginTop: 3 },
  lockedBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: installerTheme.radius.card, backgroundColor: installerTheme.background, padding: 11, marginTop: 12 },
  lockedText: { flex: 1, color: installerTheme.textMuted, fontSize: 10, lineHeight: 15 },
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
