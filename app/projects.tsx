import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, TextInput, View } from "react-native";
import { DirectionalChevron } from "@/components/directional-chevron";
import { SkeletonList } from "@/components/skeleton";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Reveal } from "@/components/motion";
import { ProjectSkyline, buildSkyline } from "@/components/project-skyline";
import {
  ActionButton,
  BrandText as Text,
  BrandMark,
  EmptyState,
  IconButton,
  ProgressRing,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { currentLocalDateKey } from "@/lib/date-key";
import { translateEnum } from "@/lib/i18n";
import { installerTheme, toneColors } from "@/lib/theme";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import { calendarEventDay, compareCalendarEvents } from "@/modules/calendar/presentation";
import type { InstallerCalendarViewModel } from "@/modules/calendar/types";
import { openProjectExternalAction } from "@/modules/projects/external-actions";
import {
  buildDashboardPrimaryAction,
  buildProjectRoute,
} from "@/modules/projects/navigation";
import { listProjectDoors, listProjectIssues, listProjects } from "@/modules/projects/repository";
import { canUseProjectCacheAfterSyncFailure } from "@/modules/projects/service";
import type { ProjectListItem } from "@/modules/projects/types";
import {
  forceColdResync,
  getLastSyncAt,
  getSyncQueueSummary,
  runSync,
} from "@/modules/sync/service";
import type { SyncQueueSummary } from "@/modules/sync/types";
import { useAuth, useI18n } from "@/providers/AppProviders";

type ProjectSummary = {
  total: number;
  installed: number;
  issues: number;
  remaining: number;
};

type HomeSnapshot = {
  projects: ProjectListItem[];
  summaries: Record<string, ProjectSummary>;
  lastSyncAt: string | null;
  queue: SyncQueueSummary | null;
  calendar: InstallerCalendarViewModel;
};
const EMPTY_HOME: HomeSnapshot = {
  projects: [], summaries: {}, lastSyncAt: null, queue: null,
  calendar: { snapshot: null, source: "unavailable", message: null },
};

function projectTone(status: string, issues: number) {
  if (issues > 0 || status.toUpperCase() === "PROBLEM") return "danger" as const;
  if (status.toUpperCase() === "COMPLETED") return "success" as const;
  return "accent" as const;
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={[styles.legendValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function ProjectsScreen() {
  const router = useRouter();
  const { user, syncVersion } = useAuth();
  const { locale, isRTL } = useI18n();
  const identity = `${user?.company_id || ""}:${user?.id || ""}`;
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  const [loaded, setLoaded] = useState<{ identity: string; value: HomeSnapshot } | null>(null);
  const hasData = loaded?.identity === identity;
  const { projects, summaries, lastSyncAt, queue, calendar } = hasData ? loaded.value : EMPTY_HOME;
  const [loading, setLoading] = useState(true);
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null);
  const busy = busyIdentity === identity;
  const syncLock = useRef<string | null>(null);
  const loadRevision = useRef(0);
  const focused = useRef(false);
  const [notice, setNotice] = useState<{ identity: string; error: string | null; offline: string | null } | null>(null);
  const error = notice?.identity === identity ? notice.error : null;
  const offlineNotice = notice?.identity === identity ? notice.offline : null;
  const assignmentRecoveryStarted = useRef<string | null>(null);
  const [view, setView] = useState<"TODAY" | "PROJECTS">("TODAY");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<"ALL" | "REMAINING" | "ISSUES">("ALL");
  const [showProgress, setShowProgress] = useState(false);

  const lt = useCallback((en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en), [locale]);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";
  const formatSyncTime = (value: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const formatEventTime = (value: string) =>
    new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

  const reload = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoading(true);
    try {
      const [projectRows, syncAt, queueRow, calendarRow] = await Promise.all([
        listProjects(),
        getLastSyncAt(),
        getSyncQueueSummary(),
        loadInstallerCalendar("7d"),
      ]);
      const summaryRows = await Promise.all(
        projectRows.map(async (project) => {
          const [doors, issues] = await Promise.all([
            listProjectDoors(project.id),
            listProjectIssues(project.id),
          ]);
          const installed = doors.filter((door) => door.status === "INSTALLED").length;
          return [
            project.id,
            {
              total: doors.length,
              installed,
              issues: issues.filter((issue) => issue.status !== "CLOSED").length,
              remaining: Math.max(doors.length - installed, 0),
            },
          ] as const;
        })
      );
      if (revision !== loadRevision.current || activeIdentity.current !== identity || !focused.current) return;
      setLoaded({ identity, value: { projects: projectRows, summaries: Object.fromEntries(summaryRows), lastSyncAt: syncAt, queue: queueRow, calendar: calendarRow } });
      setNotice((current) => current?.identity === identity ? { ...current, error: null } : null);
    } catch (reason) {
      if (revision === loadRevision.current && activeIdentity.current === identity && focused.current) throw reason;
    } finally {
      if (revision === loadRevision.current && activeIdentity.current === identity) setLoading(false);
    }
  }, [identity]);

  const loadScreen = useCallback(async () => {
    try { await reload(); }
    catch (reason) {
      if (activeIdentity.current === identity && focused.current) setNotice({ identity, offline: null, error: reason instanceof Error ? reason.message : lt("Unable to load projects", "Не удалось загрузить проекты", "לא ניתן לטעון פרויקטים") });
    }
  }, [identity, lt, reload]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void loadScreen();
    return () => { focused.current = false; loadRevision.current += 1; };
  }, [loadScreen, syncVersion]));

  useEffect(() => { setSearch(""); setProjectFilter("ALL"); }, [identity]);

  const refreshAssignedProjects = async () => {
    let queueBeforeRefresh = await getSyncQueueSummary();
    if (activeIdentity.current !== identity) return;
    if (
      queueBeforeRefresh.pending > 0 ||
      queueBeforeRefresh.failed > 0 ||
      queueBeforeRefresh.ready_to_send > 0
    ) {
      try {
        await runSync({ forceRetry: true });
      } catch {
        // Re-check the queue: a rejected retry may have been moved to BLOCKED.
      }
      queueBeforeRefresh = await getSyncQueueSummary();
    }
    if (activeIdentity.current !== identity) return;
    if (
      queueBeforeRefresh.pending > 0 ||
      queueBeforeRefresh.failed > 0 ||
      queueBeforeRefresh.ready_to_send > 0
    ) {
      throw new Error(
        lt("Sync queued work before refreshing assigned projects.", "Сначала синхронизируйте работы из очереди.", "יש לסנכרן את העבודות שבתור לפני רענון הפרויקטים.")
      );
    }
    await forceColdResync();
    if (activeIdentity.current !== identity) return;
    await reload();
  };

  const showSyncFailure = async (reason: unknown) => {
    const cachedProjectCount = (await listProjects()).length;
    if (activeIdentity.current !== identity || !focused.current) return;
    if (canUseProjectCacheAfterSyncFailure(reason, cachedProjectCount)) {
      setNotice({ identity, error: null, offline: lt(
        "Offline mode. Showing saved assignments from this phone.",
        "Работа офлайн. Показаны сохранённые задания с этого телефона.",
        "מצב לא מקוון. מוצגות המשימות השמורות בטלפון.",
      ) });
      return;
    }

    setNotice({ identity, offline: null, error: reason instanceof Error ? reason.message : lt("Sync failed", "Ошибка синхронизации", "הסנכרון נכשל") });
  };

  useEffect(() => {
    if (
      !user ||
      !queue ||
      busy ||
      syncVersion === 0 ||
      projects.length > 0 ||
      assignmentRecoveryStarted.current === identity || !focused.current || loading
    ) {
      return;
    }
    if (queue.pending > 0 || queue.ready_to_send > 0) {
      return;
    }

    assignmentRecoveryStarted.current = identity;
    void syncNow(true);
  }, [busy, identity, loading, projects.length, queue, syncVersion, user]);

  const syncNow = async (bootstrap = false) => {
    if (syncLock.current === identity) return;
    syncLock.current = identity;
    setBusyIdentity(identity);
    setNotice(null);
    try {
      if (bootstrap) {
        await refreshAssignedProjects();
        return;
      }
      await runSync({ forceRetry: true });
      if (activeIdentity.current !== identity) return;
      await reload();
    } catch (reason) {
      try { await showSyncFailure(reason); }
      catch {
        if (activeIdentity.current === identity && focused.current) setNotice({ identity, offline: null, error: lt("Sync failed", "Ошибка синхронизации", "הסנכרון נכשל") });
      }
    } finally {
      if (syncLock.current === identity) {
        syncLock.current = null;
        setBusyIdentity(null);
      }
    }
  };

  const todayKey = currentLocalDateKey();
  const todayEvents = useMemo(
    () => (calendar.snapshot?.items || []).filter((item) => calendarEventDay(item) === todayKey).sort(compareCalendarEvents),
    [calendar.snapshot, todayKey]
  );
  const openIssues = useMemo(
    () => Object.values(summaries).reduce((total, summary) => total + summary.issues, 0),
    [summaries]
  );
  const remainingDoors = useMemo(
    () => Object.values(summaries).reduce((total, summary) => total + summary.remaining, 0),
    [summaries]
  );
  const totalDoors = useMemo(
    () => Object.values(summaries).reduce((total, summary) => total + summary.total, 0),
    [summaries]
  );
  const skylineBars = useMemo(() => buildSkyline(projects, summaries), [projects, summaries]);
  const installedDoors = useMemo(
    () => Object.values(summaries).reduce((total, summary) => total + summary.installed, 0),
    [summaries]
  );
  const portfolioProgress = totalDoors ? Math.round((installedDoors / totalDoors) * 100) : 0;
  const primaryAction = useMemo(() => buildDashboardPrimaryAction(todayEvents), [todayEvents]);
  const visibleProjects = useMemo(() => projects.filter((project) => {
    const matches = `${project.name} ${project.address || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    const summary = summaries[project.id];
    return matches && (projectFilter === "ALL" || (projectFilter === "REMAINING" ? summary?.remaining > 0 : summary?.issues > 0));
  }), [projects, summaries, search, projectFilter]);
  const queueTone = !hasData && error ? "danger" : !hasData || loading ? "neutral" : offlineNotice
    ? "warning"
    : busy
      ? "info"
      : queue?.blocked
        ? "danger"
        : queue?.failed
          ? "warning"
          : queue?.total
            ? "accent"
            : "success";
  const queueLabel = !hasData && error ? lt("Data unavailable", "Данные недоступны", "הנתונים אינם זמינים") : !hasData || loading
    ? lt("Checking data", "Проверка данных", "בדיקת נתונים")
    : offlineNotice
    ? lt("Offline", "Офлайн", "לא מקוון")
    : busy
      ? lt("Synchronizing", "Синхронизация", "מסתנכרן")
      : queue?.blocked
        ? lt(`${queue.blocked} blocked`, `${queue.blocked} заблокировано`, `${queue.blocked} חסומים`)
        : queue?.total
          ? lt(`${queue.total} queued`, `${queue.total} в очереди`, `${queue.total} בתור`)
          : !lastSyncAt ? lt("Not synced yet", "Ещё не синхронизировано", "טרם סונכרן") : lt("Synced", "Синхронизировано", "מסונכרן");
  const queueIcon = !hasData || loading ? "time-outline" : offlineNotice
    ? "cloud-offline-outline"
    : busy
      ? "sync"
      : queue?.total
        ? "cloud-upload-outline"
        : "checkmark-circle-outline";

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.homeHeader}>
          <View style={styles.headerRow}>
            <BrandMark compact />
            <LocaleSwitcher dark />
          </View>
          <View style={styles.headerRow}>
            <View style={styles.rowBody}>
              <Text style={styles.eyebrow}>{lt("MY WORK", "МОЯ РАБОТА", "העבודה שלי")}</Text>
              <Text style={styles.welcomeName} accessibilityRole="header">{user?.full_name || lt("Installer", "Монтажник", "מתקין")}</Text>
            </View>
            <IconButton icon="sync" label={lt("Sync now", "Синхронизировать", "סנכרן")} tone="dark" onPress={() => void syncNow()} disabled={busy || loading} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={lt("Open sync queue", "Открыть очередь синхронизации", "פתיחת תור הסנכרון")}
            onPress={() => router.push("/sync-queue" as never)}
            style={styles.syncRow}
          >
            <StatusPill label={queueLabel} tone={queueTone} icon={queueIcon} />
            <Text style={[styles.syncMeta, { textAlign: isRTL ? "left" : "right" }]}>
              {lastSyncAt ? formatSyncTime(lastSyncAt) : lt("Sync queue", "Очередь работ", "תור עבודות")}
            </Text>
            <DirectionalChevron size={16} color={installerTheme.textMuted} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {offlineNotice ? (
            <View style={styles.offlineBox} accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={18} color={installerTheme.warning} />
              <Text style={styles.offlineText}>{offlineNotice}</Text>
            </View>
          ) : null}

          {!hasData ? (
            loading ? <SectionCard>
              <SkeletonList variant="cards" rows={3} label={lt("Loading assignments", "Загрузка заданий", "טעינת משימות")} testID="projects-loading" />
            </SectionCard> : <EmptyState
              icon="cloud-offline-outline"
              title={lt("Assignments unavailable", "Задания недоступны", "המשימות אינן זמינות")}
              action={<ActionButton label={lt("Try again", "Повторить", "ניסיון נוסף")} icon="refresh" onPress={() => void loadScreen()} />}
            />
          ) : <>
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: "TODAY", label: lt("Today", "Сегодня", "היום") },
                { value: "PROJECTS", label: lt("Projects", "Объекты", "פרויקטים") },
              ]}
            />

            <SectionCard style={styles.portfolioCard}>
              <ProjectSkyline bars={skylineBars} height={84} style={styles.portfolioSkyline} testID="portfolio-skyline" />
              <LinearGradient pointerEvents="none" colors={[installerTheme.background, "rgba(8,14,21,0.8)", "rgba(8,14,21,0.18)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFillObject} />
              <Pressable accessibilityRole="button" accessibilityLabel={lt("Overall progress", "Общий прогресс", "התקדמות כוללת")} accessibilityState={{ expanded: showProgress }} onPress={() => setShowProgress((value) => !value)} style={styles.portfolioHeader}>
                <ProgressRing value={portfolioProgress} size={56} stroke={4} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{lt("Overall progress", "Общий прогресс", "התקדמות כוללת")}</Text>
                  <Text style={styles.rowMeta}>{lt(`Installed: ${installedDoors} / ${totalDoors}`, `Установлено: ${installedDoors} / ${totalDoors}`, `הותקנו: ${installedDoors} מתוך ${totalDoors}`)}</Text>
                  <Text style={styles.rowMeta}>{`${lt("Projects", "Объекты", "פרויקטים")}: ${projects.length}`}</Text>
                </View>
                <Ionicons name={showProgress ? "chevron-up" : "chevron-down"} size={18} color={installerTheme.textMuted} />
              </Pressable>
              {showProgress ? <Reveal style={styles.portfolioLegend}>
                <LegendRow color={installerTheme.success} label={lt("Installed", "Установлено", "הותקנו")} value={installedDoors} />
                <LegendRow color={installerTheme.info} label={lt("Remaining", "Осталось", "נותרו")} value={remainingDoors} />
                <LegendRow color={installerTheme.warning} label={lt("Issues open", "Открытые проблемы", "תקלות פתוחות")} value={openIssues} />
                <LegendRow color={installerTheme.textMuted} label={lt("Queued", "В очереди", "בתור")} value={queue?.total || 0} />
              </Reveal> : null}
            </SectionCard>

            {view === "TODAY" ? <Reveal key="today" style={styles.sectionContent}>
              <SectionHeader
                title={lt("Today schedule", "План на сегодня", "תוכנית להיום")}
                meta={calendar.snapshot ? todayEvents.length : undefined}
                action={<IconButton icon="calendar-outline" label={lt("Open calendar", "Открыть календарь", "פתיחת היומן")} onPress={() => router.push("/calendar" as never)} />}
              />
              <Text style={styles.dayLabel}>{new Intl.DateTimeFormat(intlLocale, { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</Text>
              {calendar.source !== "online" || calendar.message ? (
                <StatusPill
                  label={calendar.source === "cache" ? lt("Saved plan", "Сохранённый план", "תכנית שמורה") : calendar.source === "online" ? lt("Offline copy not updated", "Офлайн-копия не обновлена", "העותק הלא מקוון לא עודכן") : lt("Plan unavailable", "План недоступен", "התכנית אינה זמינה")}
                  tone="warning" icon="cloud-offline-outline"
                />
              ) : null}
              {calendar.snapshot ? <ActionButton
                label={primaryAction.kind === "SCHEDULED_PROJECT" ? lt("Start today's work", "Начать работу на сегодня", "התחל את העבודה להיום") : lt("Open 7-day plan", "Открыть план на 7 дней", "פתיחת תכנית ל-7 ימים")}
                icon={primaryAction.kind === "SCHEDULED_PROJECT" ? (locale === "he" ? "arrow-back" : "arrow-forward") : "calendar-outline"}
                onPress={() => router.push(primaryAction.route as never)}
              /> : null}
              {todayEvents.length ? todayEvents.slice(0, 4).map((item) => (
                <Pressable
                  key={item.id} accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${formatEventTime(item.starts_at)}. ${item.location || item.event_type}`}
                  onPress={() => item.project_id ? router.push(buildProjectRoute(item.project_id) as never) : router.push("/calendar" as never)}
                  style={({ pressed }) => [styles.scheduleRow, pressed && styles.pressed]}
                >
                  <View style={styles.timeBox}><Text style={styles.timeText}>{formatEventTime(item.starts_at)}</Text></View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowMeta}>{item.location || translateEnum(locale, item.event_type)}</Text>
                  </View>
                  <DirectionalChevron size={17} color={installerTheme.textMuted} />
                </Pressable>
              )) : <EmptyState
                icon={calendar.snapshot ? "calendar-outline" : "cloud-offline-outline"}
                title={calendar.snapshot ? lt("No scheduled work today", "Сегодня нет запланированных работ", "אין עבודות מתוכננות להיום") : lt("Open the calendar to check the plan", "Откройте календарь для проверки плана", "פתחו את היומן לבדיקת התכנית")}
              />}
              <ActionButton label={lt("My projects", "Мои объекты", "הפרויקטים שלי")} icon="business-outline" variant="secondary" onPress={() => setView("PROJECTS")} />
            </Reveal> : <Reveal key="projects" style={styles.sectionContent}>
              <SectionHeader title={lt("Assigned projects", "Назначенные объекты", "פרויקטים שהוקצו")} meta={`${visibleProjects.length}/${projects.length}`} />
              {projects.length ? <>
                <View style={styles.searchField}>
                  <Ionicons name="search-outline" size={18} color={installerTheme.textMuted} />
                  <TextInput value={search} onChangeText={setSearch} accessibilityLabel={lt("Search projects", "Поиск объектов", "חיפוש פרויקטים")} placeholder={lt("Name or address", "Название или адрес", "שם או כתובת")} placeholderTextColor={installerTheme.textFaint} style={styles.searchInput} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {(["ALL", "REMAINING", "ISSUES"] as const).map((value) => (
                    <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: projectFilter === value }}
                      accessibilityLabel={value === "ALL" ? lt("All projects", "Все объекты", "כל הפרויקטים") : value === "REMAINING" ? lt("Work remaining", "Есть работа", "נותרה עבודה") : lt("With issues", "С проблемами", "עם תקלות")}
                      onPress={() => setProjectFilter(value)} style={[styles.filterChip, projectFilter === value && styles.filterActive]}>
                      <Text style={[styles.filterText, projectFilter === value && styles.filterActiveText]}>{value === "ALL" ? lt("All projects", "Все объекты", "כל הפרויקטים") : value === "REMAINING" ? lt("Work remaining", "Есть работа", "נותרה עבודה") : lt("With issues", "С проблемами", "עם תקלות")}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </> : null}
              {visibleProjects.map((project) => {
                const summary = summaries[project.id] || { total: 0, installed: 0, issues: 0, remaining: 0 };
                const progress = summary.total ? Math.round((summary.installed / summary.total) * 100) : 0;
                const tone = projectTone(project.status, summary.issues);
                const palette = toneColors(tone);
                return <SectionCard key={project.id} style={styles.projectCard}>
                  <View pointerEvents="none" style={[styles.projectRiskStrip, { backgroundColor: palette.text }]} />
                  <Pressable accessibilityRole="button" accessibilityLabel={project.name} onPress={() => router.push(buildProjectRoute(project.id) as never)} style={styles.projectMain}>
                    <View style={styles.projectTop}>
                      <View style={[styles.projectGlyph, { borderColor: palette.border }]}>
                        <Ionicons name="business-outline" size={22} color={palette.text} />
                      </View>
                      <View style={styles.projectIdentity}>
                        <Text style={styles.projectTitle}>{project.name}</Text>
                        <Text style={styles.projectAddress}>{project.address || lt("Address not set", "Адрес не указан", "הכתובת לא הוגדרה")}</Text>
                      </View>
                      <DirectionalChevron size={18} color={installerTheme.info} />
                    </View>
                    <View style={styles.projectStatus}>
                      <StatusPill label={translateEnum(locale, project.status)} tone={project.status === "COMPLETED" ? "success" : "accent"} />
                      {summary.issues ? <StatusPill label={`${lt("Issues", "Проблемы", "תקלות")}: ${summary.issues}`} tone="danger" icon="alert-circle-outline" /> : null}
                    </View>
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
                    <View style={styles.progressLegend}>
                      <Text style={styles.progressText}>{lt(`Installed: ${summary.installed} / ${summary.total}`, `Установлено: ${summary.installed} / ${summary.total}`, `הותקנו: ${summary.installed} מתוך ${summary.total}`)}</Text>
                      <Text style={styles.progressValue}>{progress}%</Text>
                    </View>
                    <View style={styles.projectStats}>
                      <Text style={styles.projectStatLabel}>{`${lt("Remaining", "Осталось", "נותרו")}: ${summary.remaining}`}</Text>
                      <Text style={styles.projectStatLabel}>{lt("Open doors", "Открыть двери", "פתיחת דלתות")}</Text>
                    </View>
                  </Pressable>
                  {project.waze_url || summary.issues ? <View style={styles.projectActions}>
                    {project.waze_url ? <ActionButton label={lt("Waze", "Waze", "Waze")} icon="navigate-outline" variant="secondary" style={styles.flexButton} onPress={() => void openProjectExternalAction({ kind: "waze", url: project.waze_url as string }).catch((reason) => {
                      if (activeIdentity.current === identity) setNotice({ identity, offline: null, error: reason instanceof Error ? reason.message : lt("Unable to open Waze", "Не удалось открыть Waze", "לא ניתן לפתוח את Waze") });
                    })} /> : null}
                    {summary.issues ? <ActionButton label={lt("Issues", "Проблемы", "תקלות")} icon="alert-circle-outline" variant="secondary" style={styles.flexButton} onPress={() => router.push(`/issues?projectId=${encodeURIComponent(project.id)}` as never)} /> : null}
                  </View> : null}
                </SectionCard>;
              })}
              {projects.length && !visibleProjects.length ? <EmptyState icon="search-outline" title={lt("No matching projects", "Объекты не найдены", "לא נמצאו פרויקטים")} action={<ActionButton label={lt("Reset filters", "Сбросить фильтры", "איפוס מסננים")} variant="secondary" icon="close" onPress={() => { setSearch(""); setProjectFilter("ALL"); }} />} /> : null}
              {!projects.length ? <EmptyState
                icon="business-outline"
                title={lastSyncAt ? lt("No assigned projects", "Нет назначенных объектов", "אין פרויקטים שהוקצו") : lt("Assignments not downloaded", "Задания ещё не загружены", "המשימות טרם הורדו")}
                action={<ActionButton label={lt("Download assigned work", "Загрузить назначенные объекты", "הורד עבודות")} icon="cloud-download-outline" onPress={() => void syncNow(true)} loading={busy} />}
              /> : null}
            </Reveal>}
          </>}
        </View>
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  content: { flex: 1 },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  homeHeader: { padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: installerTheme.border },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  welcomeName: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 23, lineHeight: 31, marginTop: 3 },
  eyebrow: { color: installerTheme.accent, fontFamily: installerTheme.fontFamilyMedium, fontSize: installerTheme.type.caption, lineHeight: 15 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  syncMeta: { flex: 1, minWidth: 0, color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16 },
  body: { gap: 14, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  sectionContent: { gap: 12 },
  portfolioCard: { overflow: "hidden", padding: 0 },
  portfolioSkyline: { position: "absolute", end: 12, bottom: 0, width: "56%", opacity: 0.9 },
  portfolioHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, minHeight: 92 },
  portfolioLegend: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { flex: 1, color: installerTheme.textMuted, fontSize: 12, lineHeight: 17 },
  legendValue: { fontFamily: installerTheme.fontFamilyMono, fontSize: 13 },
  dayLabel: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18, marginTop: -8 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: installerTheme.radius.md, borderWidth: 1, borderColor: installerTheme.dangerBorder, backgroundColor: installerTheme.dangerSoft, padding: 12 },
  errorText: { flex: 1, color: installerTheme.danger, fontSize: 12, lineHeight: 18 },
  offlineBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: installerTheme.radius.md, borderWidth: 1, borderColor: installerTheme.warningBorder, backgroundColor: installerTheme.warningSoft, padding: 12 },
  offlineText: { flex: 1, color: installerTheme.warning, fontSize: 12, lineHeight: 18 },
  scheduleRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: installerTheme.border, paddingVertical: 12 },
  timeBox: { width: 56, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.accentWarm, borderWidth: 1, borderColor: installerTheme.accentEdge },
  timeText: { color: installerTheme.accentText, fontFamily: installerTheme.fontFamilyMono, fontSize: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: installerTheme.text, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  rowMeta: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  searchField: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, paddingHorizontal: 12, borderRadius: installerTheme.radius.md, borderWidth: 1, borderColor: installerTheme.borderStrong, backgroundColor: installerTheme.shellRaised },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 10, color: installerTheme.text, fontFamily: installerTheme.fontFamily, fontSize: 13 },
  filterRow: { gap: 8 },
  filterChip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: installerTheme.radius.pill, borderWidth: 1, borderColor: installerTheme.border, backgroundColor: installerTheme.shellRaised },
  filterActive: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.primarySoft },
  filterText: { fontSize: 12, fontWeight: "700", color: installerTheme.textMuted },
  filterActiveText: { color: installerTheme.info },
  projectCard: { padding: 0, overflow: "hidden", borderColor: installerTheme.borderStrong },
  projectMain: { minHeight: 160, padding: 16, gap: 12 },
  projectRiskStrip: { position: "absolute", top: 0, bottom: 0, start: 0, width: 3 },
  projectTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  projectGlyph: { width: 42, height: 46, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, borderWidth: 1, backgroundColor: installerTheme.background },
  projectIdentity: { flex: 1, minWidth: 0 },
  projectTitle: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 16, lineHeight: 23 },
  projectAddress: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  projectStatus: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  progressTrack: { height: 5, borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.border, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: installerTheme.radius.pill, backgroundColor: installerTheme.successFill },
  progressLegend: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: -6 },
  progressText: { flex: 1, color: installerTheme.textMuted, fontSize: 12, lineHeight: 17 },
  progressValue: { color: installerTheme.success, fontFamily: installerTheme.fontFamilyMono, fontSize: 12 },
  projectStats: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  projectStatLabel: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 17 },
  projectActions: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: installerTheme.border },
  flexButton: { flex: 1 },
  pressed: { opacity: 0.7 },
});
