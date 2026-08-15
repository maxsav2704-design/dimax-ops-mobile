import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import {
  ActionButton,
  IconButton,
  MetricTile,
  ScreenHero,
  SectionCard,
  SectionHeader,
  StatusPill,
} from "@/components/mobile-ui";
import { currentLocalDateKey } from "@/lib/date-key";
import { installerTheme } from "@/lib/theme";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import type { InstallerCalendarViewModel } from "@/modules/calendar/types";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";
import { openProjectExternalAction } from "@/modules/projects/external-actions";
import { buildIssueProjectRoute, buildProjectRoute } from "@/modules/projects/navigation";
import { listProjectDoors, listProjectIssues, listProjects } from "@/modules/projects/repository";
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

function projectTone(status: string, issues: number) {
  if (issues > 0 || status.toUpperCase() === "PROBLEM") return "danger" as const;
  if (status.toUpperCase() === "COMPLETED") return "success" as const;
  return "accent" as const;
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
    void reload();
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

  useEffect(() => {
    if (!user || !queue || busy || assignmentRecoveryStarted.current) {
      return;
    }
    if (queue.pending > 0 || queue.ready_to_send > 0) {
      return;
    }

    assignmentRecoveryStarted.current = true;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await refreshAssignedProjects();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : lt("Sync failed", "РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё", "Ч”ЧЎЧ Ч›ЧЁЧ•Чџ Ч Ч›Ч©Чњ"));
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, queue, user]);

  const syncNow = async (bootstrap = false) => {
    setBusy(true);
    setError(null);
    try {
      if (bootstrap) {
        await refreshAssignedProjects();
        return;
      }
      const response = await runSync({ forceRetry: true });
      await reload();
      setLastSyncAt(response.server_time);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Sync failed", "Ошибка синхронизации", "הסנכרון נכשל"));
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
  const queueTone = queue?.blocked ? "danger" : queue?.failed ? "warning" : queue?.total ? "accent" : "success";
  const queueLabel = queue?.blocked
    ? lt(`${queue.blocked} blocked`, `${queue.blocked} заблокировано`, `${queue.blocked} חסומים`)
    : queue?.total
      ? lt(`${queue.total} queued`, `${queue.total} в очереди`, `${queue.total} בתור`)
      : lt("Synced", "Синхронизировано", "מסונכרן");

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
          <View style={styles.syncRow}>
            <StatusPill
              label={queueLabel}
              tone={queueTone}
              icon={queue?.total ? "cloud-upload-outline" : "checkmark-circle-outline"}
            />
            <Pressable onPress={() => router.push("/sync-queue" as never)}>
              <Text style={styles.syncMeta} numberOfLines={1}>
                {lastSyncAt
                  ? `${lt("Last sync", "Последняя синхронизация", "סנכרון אחרון")}: ${formatSyncTime(lastSyncAt)}`
                  : lt("Local data ready", "Локальные данные готовы", "המידע המקומי מוכן")}
              </Text>
            </Pressable>
          </View>
        </ScreenHero>

        <View style={styles.body}>
          <View style={styles.metrics}>
            <MetricTile label={lt("Today", "Сегодня", "היום")} value={todayEvents.length} meta={lt("scheduled items", "задач в плане", "משימות")} tone="info" />
            <MetricTile label={lt("Projects", "Объекты", "אתרים")} value={projects.length} meta={lt("assigned to you", "назначено вам", "משויכים אליך")} tone="accent" />
            <MetricTile label={lt("Issues", "Проблемы", "תקלות")} value={openIssues} meta={lt("need attention", "требуют внимания", "דורשות טיפול")} tone={openIssues ? "danger" : "success"} />
            <MetricTile label={lt("Today pay", "Сегодня", "שכר היום")} value={earnings.snapshot?.today_total || "—"} meta={earnings.snapshot?.currency || "ILS"} tone="success" />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <SectionCard>
            <SectionHeader
              title={lt("Today schedule", "План на сегодня", "תוכנית להיום")}
              meta={todayEvents.length}
              action={
                <Pressable onPress={() => router.push("/calendar" as never)}>
                  <Text style={styles.link}>{lt("Calendar", "Календарь", "יומן")}</Text>
                </Pressable>
              }
            />
            {todayEvents.length ? (
              <View style={styles.list}>
                {todayEvents.slice(0, 4).map((item) => (
                  <Pressable
                    key={item.id}
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
            return (
              <SectionCard key={project.id} style={styles.projectCard}>
                <View style={styles.projectTop}>
                  <View style={styles.projectIdentity}>
                    <Text style={styles.projectTitle} numberOfLines={1}>{project.name}</Text>
                    <Text style={styles.projectAddress} numberOfLines={2}>{project.address || lt("Address not set", "Адрес не указан", "הכתובת לא הוגדרה")}</Text>
                  </View>
                  <StatusPill
                    label={summary.issues ? lt("Problem", "Проблема", "תקלה") : project.status}
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
                    <Text style={styles.projectStatValue}>{summary.remaining}</Text>
                    <Text style={styles.projectStatLabel}>{lt("remaining", "осталось", "נותרו")}</Text>
                  </View>
                  <View style={styles.projectStat}>
                    <Text style={[styles.projectStatValue, summary.issues > 0 && { color: installerTheme.danger }]}>{summary.issues}</Text>
                    <Text style={styles.projectStatLabel}>{lt("issues", "проблемы", "תקלות")}</Text>
                  </View>
                  <View style={styles.projectStat}>
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
    marginTop: 16,
  },
  syncMeta: {
    maxWidth: 190,
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
  },
  body: {
    gap: 12,
    padding: 12,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
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
  errorText: {
    flex: 1,
    color: installerTheme.danger,
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
    color: "#8A6C1F",
    fontFamily: "monospace",
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
    padding: 0,
    overflow: "hidden",
  },
  projectTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
  },
  projectIdentity: {
    flex: 1,
    minWidth: 0,
  },
  projectTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 16,
    fontWeight: "800",
  },
  projectAddress: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  progressTrack: {
    height: 5,
    backgroundColor: installerTheme.background,
    marginHorizontal: 14,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: installerTheme.successFill,
  },
  progressLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 6,
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
    marginTop: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: installerTheme.border,
  },
  projectStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: installerTheme.border,
  },
  projectStatValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 15,
    fontWeight: "800",
  },
  projectStatLabel: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 8,
    marginTop: 2,
  },
  projectActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
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
