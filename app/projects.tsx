import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import {
  ActionButton,
  BrandText as Text,
  IconButton,
  ProgressRing,
  ScreenHero,
  SectionCard,
  SectionHeader,
  StatusPill,
} from "@/components/mobile-ui";
import { currentLocalDateKey } from "@/lib/date-key";
import { translateEnum } from "@/lib/i18n";
import { installerTheme, toneColors } from "@/lib/theme";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import type { InstallerCalendarViewModel } from "@/modules/calendar/types";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";
import { openProjectExternalAction } from "@/modules/projects/external-actions";
import {
  buildDashboardPrimaryAction,
  buildIssueProjectRoute,
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

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function projectTone(status: string, issues: number) {
  if (issues > 0 || status.toUpperCase() === "PROBLEM") return "danger" as const;
  if (status.toUpperCase() === "COMPLETED") return "success" as const;
  return "accent" as const;
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.legendValue, { color }]}>{value}</Text>
    </View>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <View style={styles.summaryTile}>
      <Ionicons name={icon} size={16} color={tone} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function ProjectsScreen() {
  const router = useRouter();
  const { user, syncVersion } = useAuth();
  const { locale } = useI18n();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ProjectSummary>>({});
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [queue, setQueue] = useState<SyncQueueSummary | null>(null);
  const [calendar, setCalendar] = useState<InstallerCalendarViewModel>({ snapshot: null, source: "unavailable", message: null });
  const [earnings, setEarnings] = useState<InstallerEarningsViewModel>({ snapshot: null, source: "unavailable", message: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const assignmentRecoveryStarted = useRef(false);

  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
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

  const reload = async () => {
    const [projectRows, syncAt, queueRow, calendarRow, earningsRow] = await Promise.all([
      listProjects(),
      getLastSyncAt(),
      getSyncQueueSummary(),
      loadInstallerCalendar("7d"),
      loadInstallerEarnings("month", currentLocalDateKey()),
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
    setProjects(projectRows);
    setSummaries(Object.fromEntries(summaryRows));
    setLastSyncAt(syncAt);
    setQueue(queueRow);
    setCalendar(calendarRow);
    setEarnings(earningsRow);
  };

  useEffect(() => {
    void reload().then(() => {
      setError(null);
      setOfflineNotice(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : lt("Unable to load projects", "Не удалось загрузить проекты", "לא ניתן לטעון פרויקטים"));
    });
  }, [syncVersion]);

  const refreshAssignedProjects = async () => {
    let queueBeforeRefresh = await getSyncQueueSummary();
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
    if (
      queueBeforeRefresh.pending > 0 ||
      queueBeforeRefresh.failed > 0 ||
      queueBeforeRefresh.ready_to_send > 0
    ) {
      throw new Error(
        "Sync queued work before refreshing assigned projects."
      );
    }
    const response = await forceColdResync();
    await reload();
    setLastSyncAt(response.server_time);
  };

  const showSyncFailure = async (reason: unknown) => {
    const cachedProjectCount = (await listProjects()).length;
    if (canUseProjectCacheAfterSyncFailure(reason, cachedProjectCount)) {
      setError(null);
      setOfflineNotice(lt(
        "Offline mode. Showing saved assignments from this phone.",
        "Работа офлайн. Показаны сохранённые задания с этого телефона.",
        "מצב לא מקוון. מוצגות המשימות השמורות בטלפון.",
      ));
      return;
    }

    setOfflineNotice(null);
    setError(reason instanceof Error ? reason.message : lt("Sync failed", "Ошибка синхронизации", "הסנכרון נכשל"));
  };

  useEffect(() => {
    if (
      !user ||
      !queue ||
      busy ||
      syncVersion === 0 ||
      projects.length > 0 ||
      assignmentRecoveryStarted.current
    ) {
      return;
    }
    if (queue.pending > 0 || queue.ready_to_send > 0) {
      return;
    }

    assignmentRecoveryStarted.current = true;
    void (async () => {
      setBusy(true);
      setError(null);
      setOfflineNotice(null);
      try {
        await refreshAssignedProjects();
      } catch (reason) {
        await showSyncFailure(reason);
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, projects.length, queue, syncVersion, user]);

  const syncNow = async (bootstrap = false) => {
    setBusy(true);
    setError(null);
    setOfflineNotice(null);
    try {
      if (bootstrap) {
        await refreshAssignedProjects();
        return;
      }
      const response = await runSync({ forceRetry: true });
      await reload();
      setLastSyncAt(response.server_time);
    } catch (reason) {
      await showSyncFailure(reason);
    } finally {
      setBusy(false);
    }
  };

  const todayKey = currentLocalDateKey();
  const todayEvents = useMemo(
    () => (calendar.snapshot?.items || []).filter((item) => item.starts_at.slice(0, 10) === todayKey),
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
  const installedDoors = useMemo(
    () => Object.values(summaries).reduce((total, summary) => total + summary.installed, 0),
    [summaries]
  );
  const portfolioProgress = totalDoors ? Math.round((installedDoors / totalDoors) * 100) : 0;
  const primaryAction = useMemo(() => buildDashboardPrimaryAction(todayEvents), [todayEvents]);
  const queueTone = offlineNotice
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
  const queueLabel = offlineNotice
    ? lt("Offline", "Офлайн", "לא מקוון")
    : busy
      ? lt("Synchronizing", "Синхронизация", "מסתנכרן")
      : queue?.blocked
        ? lt(`${queue.blocked} blocked`, `${queue.blocked} заблокировано`, `${queue.blocked} חסומים`)
        : queue?.total
          ? lt(`${queue.total} queued`, `${queue.total} в очереди`, `${queue.total} בתור`)
          : lt("Synced", "Синхронизировано", "מסונכרן");
  const queueIcon = offlineNotice
    ? "cloud-offline-outline"
    : busy
      ? "sync"
      : queue?.total
        ? "cloud-upload-outline"
        : "checkmark-circle-outline";

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          eyebrow={lt("TODAY · FIELD WORKSPACE", "СЕГОДНЯ · РАБОЧЕЕ МЕСТО", "היום · סביבת עבודה")}
          title={user?.full_name || lt("Installer", "Монтажник", "מתקין")}
          subtitle={lt(
            `${projects.length} assigned projects · ${remainingDoors} doors remaining`,
            `${projects.length} объектов · осталось дверей: ${remainingDoors}`,
            `${projects.length} אתרים · ${remainingDoors} דלתות נותרו`
          )}
          right={
            <View style={styles.heroActions}>
              <LocaleSwitcher dark />
              <IconButton
                icon="sync"
                label={lt("Sync now", "Синхронизировать", "סנכרן")}
                tone="dark"
                onPress={() => void syncNow(true)}
                disabled={busy}
              />
            </View>
          }
        >
          <View style={styles.syncRow} accessibilityLiveRegion="polite">
            <StatusPill
              label={queueLabel}
              tone={queueTone}
              icon={queueIcon}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={lt("Open sync queue", "Открыть очередь синхронизации", "פתיחת תור הסנכרון")}
              hitSlop={8}
              onPress={() => router.push("/sync-queue" as never)}
            >
              <Text style={styles.syncMeta} numberOfLines={1}>
                {lastSyncAt
                  ? `${lt("Last sync", "Последняя синхронизация", "סנכרון אחרון")}: ${formatSyncTime(lastSyncAt)}`
                  : lt("Local data ready", "Локальные данные готовы", "המידע המקומי מוכן")}
              </Text>
            </Pressable>
          </View>
        </ScreenHero>

        <View style={styles.body}>
          <SectionCard style={styles.portfolioCard}>
            <Image
              source={require("../assets/premium/tower-a.jpg")}
              resizeMode="cover"
              style={styles.portfolioImage}
              accessibilityIgnoresInvertColors
            />
            <LinearGradient
              pointerEvents="none"
              colors={[installerTheme.background, "rgba(8,14,21,0.72)", "rgba(8,14,21,0.12)"]}
              locations={[0, 0.58, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.portfolioContent}>
              <View style={styles.portfolioHeader}>
                <Text style={styles.eyebrow}>{lt("PORTFOLIO PROGRESS", "ПРОГРЕСС ОБЪЕКТОВ", "התקדמות הפרויקטים")}</Text>
                <View style={styles.siteBadge}>
                  <Text style={styles.siteBadgeText}>{projects.length} {lt("sites", "объектов", "אתרים")}</Text>
                </View>
              </View>
              <View style={styles.portfolioMain}>
                <ProgressRing value={portfolioProgress} size={104} stroke={8} />
                <View style={styles.portfolioLegend}>
                  <LegendRow color={installerTheme.success} label={lt("Installed", "Установлено", "הותקנו")} value={installedDoors} />
                  <LegendRow color={installerTheme.info} label={lt("Remaining", "Осталось", "נותרו")} value={remainingDoors} />
                  <LegendRow color={installerTheme.warning} label={lt("Issues open", "Открытые проблемы", "תקלות פתוחות")} value={openIssues} />
                  <LegendRow color={installerTheme.purple} label={lt("Queued", "В очереди", "בתור")} value={queue?.total || 0} />
                </View>
              </View>
            </View>
          </SectionCard>

          <View style={styles.todayHeader}>
            <Text style={styles.todayTitle}>{lt("Today", "Сегодня", "היום")}</Text>
            <Text style={styles.todayMeta}>{todayEvents.length} {lt("scheduled", "в плане", "מתוכננות")}</Text>
          </View>
          <View style={styles.metrics}>
            <SummaryTile icon="calendar-outline" label={lt("Planned", "План", "מתוכנן")} value={todayEvents.length} tone={installerTheme.info} />
            <SummaryTile icon="construct-outline" label={lt("Remaining", "Осталось", "נותרו")} value={remainingDoors} tone={installerTheme.primary} />
            <SummaryTile icon="checkmark-circle-outline" label={lt("Installed", "Готово", "הושלם")} value={installedDoors} tone={installerTheme.success} />
            <SummaryTile icon="alert-circle-outline" label={lt("Issues", "Проблемы", "תקלות")} value={openIssues} tone={installerTheme.warning} />
          </View>

          <ActionButton
            label={
              primaryAction.kind === "SCHEDULED_PROJECT"
                ? lt("Start today's work", "Начать работу на сегодня", "התחל את העבודה להיום")
                : lt("Open 7-day plan", "Открыть план на 7 дней", "פתיחת תכנית ל-7 ימים")
            }
            icon={primaryAction.kind === "SCHEDULED_PROJECT" ? "arrow-forward" : "calendar-outline"}
            onPress={() => router.push(primaryAction.route as never)}
          />

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

          <SectionCard>
            <SectionHeader
              title={lt("Today schedule", "План на сегодня", "תוכנית להיום")}
              meta={todayEvents.length}
              action={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={lt("Open calendar", "Открыть календарь", "פתיחת היומן")}
                  onPress={() => router.push("/calendar" as never)}
                >
                  <Text style={styles.link}>{lt("Calendar", "Календарь", "יומן")}</Text>
                </Pressable>
              }
            />
            {todayEvents.length ? (
              <View style={styles.list}>
                {todayEvents.slice(0, 4).map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}. ${formatEventTime(item.starts_at)}. ${item.location || item.event_type}`}
                    onPress={() => item.project_id ? router.push(buildProjectRoute(item.project_id) as never) : router.push("/calendar" as never)}
                    style={({ pressed }) => [styles.scheduleRow, pressed && styles.pressed]}
                  >
                    <View style={styles.timeBox}>
                      <Text style={styles.timeText}>{formatEventTime(item.starts_at)}</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>{item.location || item.event_type}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={installerTheme.textFaint} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>{lt("No scheduled work today.", "На сегодня нет назначенных работ.", "אין עבודות מתוכננות להיום.")}</Text>
            )}
          </SectionCard>

          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>{lt("MY JOBS", "МОИ ОБЪЕКТЫ", "העבודות שלי")}</Text>
            <Text style={styles.sectionCount}>{projects.length}</Text>
          </View>

          {projects.map((project) => {
            const summary = summaries[project.id] || { total: 0, installed: 0, issues: 0, remaining: 0 };
            const progress = summary.total ? Math.round((summary.installed / summary.total) * 100) : 0;
            const tone = projectTone(project.status, summary.issues);
            const tonePalette = toneColors(tone);
            return (
              <SectionCard key={project.id} style={styles.projectCard}>
                <View style={[styles.projectRiskStrip, { backgroundColor: tonePalette.text }]} />
                <View style={styles.projectTop}>
                  <View style={[styles.projectGlyph, { borderColor: tonePalette.border }]}>
                    <Ionicons name="business-outline" size={21} color={tonePalette.text} />
                    <View style={[styles.projectGlyphBeacon, { backgroundColor: tonePalette.text }]} />
                  </View>
                  <View style={styles.projectIdentity}>
                    <Text style={styles.projectTitle} numberOfLines={1}>{project.name}</Text>
                    <Text style={styles.projectAddress} numberOfLines={2}>{project.address || lt("Address not set", "Адрес не указан", "הכתובת לא הוגדרה")}</Text>
                  </View>
                  <StatusPill
                    label={summary.issues ? lt("Problem", "Проблема", "תקלה") : translateEnum(locale, project.status)}
                    tone={tone}
                    icon={summary.issues ? "alert-circle-outline" : "checkmark-circle-outline"}
                  />
                </View>

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <View style={styles.progressLegend}>
                  <Text style={styles.progressText}>{summary.installed}/{summary.total} {lt("installed", "установлено", "הותקנו")}</Text>
                  <Text style={styles.progressValue}>{progress}%</Text>
                </View>

                <View style={styles.projectStats}>
                  <View style={styles.projectStat}>
                    <Ionicons name="time-outline" size={14} color={installerTheme.textMuted} />
                    <Text style={styles.projectStatValue}>{summary.remaining}</Text>
                    <Text style={styles.projectStatLabel}>{lt("remaining", "осталось", "נותרו")}</Text>
                  </View>
                  <View style={styles.projectStat}>
                    <Ionicons name="alert-circle-outline" size={14} color={summary.issues ? installerTheme.danger : installerTheme.textMuted} />
                    <Text style={[styles.projectStatValue, summary.issues > 0 && { color: installerTheme.danger }]}>{summary.issues}</Text>
                    <Text style={styles.projectStatLabel}>{lt("issues", "проблемы", "תקלות")}</Text>
                  </View>
                  <View style={styles.projectStat}>
                    <Ionicons name="grid-outline" size={14} color={installerTheme.textMuted} />
                    <Text style={styles.projectStatValue}>{summary.total}</Text>
                    <Text style={styles.projectStatLabel}>{lt("doors", "дверей", "דלתות")}</Text>
                  </View>
                </View>

                <View style={styles.projectActions}>
                  <ActionButton
                    label={lt("Open job", "Открыть объект", "פתח עבודה")}
                    icon="briefcase-outline"
                    variant="dark"
                    style={styles.flexButton}
                    onPress={() => router.push(buildProjectRoute(project.id) as never)}
                  />
                  {project.waze_url ? (
                    <IconButton
                      icon="navigate-outline"
                      label={lt("Open Waze", "Открыть Waze", "פתח Waze")}
                      onPress={() => void openProjectExternalAction({ kind: "waze", url: project.waze_url as string }).catch((reason) => setError(reason instanceof Error ? reason.message : "Waze failed"))}
                    />
                  ) : null}
                  {summary.issues ? (
                    <IconButton
                      icon="alert-circle-outline"
                      label={lt("Open issues", "Открыть проблемы", "פתח תקלות")}
                      onPress={() => router.push(buildIssueProjectRoute(project.id) as never)}
                    />
                  ) : null}
                </View>
              </SectionCard>
            );
          })}

          {!projects.length ? (
            <SectionCard>
              <View style={styles.bootstrapBox}>
                <Ionicons name="cloud-download-outline" size={28} color={installerTheme.textFaint} />
                <Text style={styles.bootstrapTitle}>{lt("No assigned work cached", "Назначенные объекты ещё не загружены", "אין עבודות שמורות")}</Text>
                <Text style={styles.bootstrapCopy}>{lt("Connect once to download your projects for offline work.", "Подключитесь один раз, чтобы загрузить объекты для офлайн-работы.", "התחבר פעם אחת כדי להוריד עבודות לאופליין.")}</Text>
                <ActionButton
                  label={lt("Download assigned work", "Загрузить назначенные объекты", "הורד עבודות")}
                  icon="cloud-download-outline"
                  onPress={() => void syncNow(true)}
                  loading={busy}
                />
              </View>
            </SectionCard>
          ) : null}
        </View>
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: installerTheme.background,
  },
  content: {
    flex: 1,
  },
  scroll: {
    paddingBottom: installerTheme.layout.bottomNavClearance,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
  },
  syncMeta: {
    maxWidth: 190,
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
  },
  body: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  portfolioCard: {
    minHeight: 224,
    overflow: "hidden",
    padding: 0,
    borderRadius: installerTheme.radius.glass,
  },
  portfolioImage: {
    position: "absolute",
    top: 0,
    end: 0,
    width: "68%",
    height: "100%",
    opacity: 0.42,
  },
  portfolioContent: {
    flex: 1,
    padding: 18,
  },
  portfolioHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  eyebrow: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 10,
    letterSpacing: 0,
  },
  siteBadge: {
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: "rgba(19,24,33,0.74)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  siteBadgeText: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 9,
  },
  portfolioMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 20,
  },
  portfolioLegend: {
    flex: 1,
    gap: 9,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    flex: 1,
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
  },
  legendValue: {
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 10,
  },
  todayHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 3,
  },
  todayTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyDisplay,
    fontSize: 18,
  },
  todayMeta: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 10,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
  },
  summaryTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: "rgba(19,24,33,0.78)",
  },
  summaryValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyDisplay,
    fontSize: 18,
    lineHeight: 20,
  },
  summaryLabel: {
    maxWidth: "94%",
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 8,
    textAlign: "center",
  },
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
  errorText: {
    flex: 1,
    color: installerTheme.danger,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
  },
  offlineBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.warningBorder,
    backgroundColor: installerTheme.warningSoft,
    padding: 11,
  },
  offlineText: {
    flex: 1,
    color: installerTheme.warning,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
  },
  link: {
    color: installerTheme.infoFill,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
    fontWeight: "800",
  },
  list: {
    marginTop: 8,
  },
  scheduleRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: installerTheme.border,
    paddingVertical: 9,
  },
  timeBox: {
    minWidth: 50,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.md,
    backgroundColor: installerTheme.accentWarm,
    borderWidth: 1,
    borderColor: installerTheme.accentEdge,
  },
  timeText: {
    color: installerTheme.accentText,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 10,
    fontWeight: "800",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    fontWeight: "800",
  },
  rowMeta: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    marginTop: 3,
  },
  emptyText: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    marginTop: 10,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: 3,
  },
  sectionLabel: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "800",
  },
  sectionCount: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "800",
  },
  projectCard: {
    position: "relative",
    padding: 0,
    overflow: "hidden",
    borderColor: installerTheme.borderStrong,
    backgroundColor: installerTheme.shellRaised,
  },
  projectRiskStrip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    width: 3,
  },
  projectTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    paddingStart: 16,
  },
  projectGlyph: {
    position: "relative",
    width: 42,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    backgroundColor: installerTheme.background,
  },
  projectGlyphBeacon: {
    position: "absolute",
    end: -3,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: installerTheme.radius.pill,
    borderWidth: 2,
    borderColor: installerTheme.shellRaised,
  },
  projectIdentity: {
    flex: 1,
    minWidth: 0,
  },
  projectTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyDisplay,
    fontSize: 14,
  },
  projectAddress: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },
  progressTrack: {
    height: 5,
    backgroundColor: installerTheme.border,
    marginHorizontal: 12,
    marginStart: 16,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: installerTheme.successFill,
  },
  progressLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingStart: 16,
    paddingTop: 5,
  },
  progressText: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
  },
  progressValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    fontWeight: "800",
  },
  projectStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 12,
    paddingStart: 16,
    paddingVertical: 7,
  },
  projectStat: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  projectStatValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
    fontWeight: "800",
  },
  projectStatLabel: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 8,
  },
  projectActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingStart: 14,
    paddingVertical: 9,
  },
  flexButton: {
    flex: 1,
  },
  bootstrapBox: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  bootstrapTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  bootstrapCopy: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginBottom: 6,
  },
  pressed: {
    opacity: 0.7,
  },
});
