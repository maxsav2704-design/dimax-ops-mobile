import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { InstallerBottomNav, installerTheme } from "@/components/installer-ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { translateEnum } from "@/lib/i18n";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import type { InstallerCalendarViewModel } from "@/modules/calendar/types";
import { buildEarningsFocusContext } from "@/modules/earnings/presentation";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsViewModel } from "@/modules/earnings/types";
import {
  buildIssueProjectRoute,
  buildPriorityRoute,
  buildProblemProjectRoute,
  buildProjectRoute,
} from "@/modules/projects/navigation";
import { listProjects } from "@/modules/projects/repository";
import type { ProjectListItem } from "@/modules/projects/types";
import { bootstrapOnlineData, countPendingEvents, getLastSyncAt, getSyncQueueSummary, runSync } from "@/modules/sync/service";
import type { SyncQueueSummary } from "@/modules/sync/types";
import { useAuth, useI18n } from "@/providers/AppProviders";

export default function ProjectsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t, isRTL, locale } = useI18n();
  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [queueSummary, setQueueSummary] = useState<SyncQueueSummary | null>(null);
  const [calendarState, setCalendarState] = useState<InstallerCalendarViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [earningsState, setEarningsState] = useState<InstallerEarningsViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [workspaceEarningsFocus, setWorkspaceEarningsFocus] = useState<"TODAY" | "MONTH" | "DAY">("TODAY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const [projects, lastSync, pending, summary, calendar, earnings] = await Promise.all([
      listProjects(),
      getLastSyncAt(),
      countPendingEvents(),
      getSyncQueueSummary(),
      loadInstallerCalendar("7d"),
      loadInstallerEarnings(),
    ]);
    setItems(projects);
    setLastSyncAt(lastSync);
    setPendingCount(pending);
    setQueueSummary(summary);
    setCalendarState(calendar);
    setEarningsState(earnings);
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

  const todayTasksCount = useMemo(() => {
    const items = calendarState.snapshot?.items || [];
    const todayKey = new Date().toISOString().slice(0, 10);
    return items.filter((item) => item.starts_at.slice(0, 10) === todayKey).length;
  }, [calendarState.snapshot]);

  const problemProjects = useMemo(
    () => items.filter((item) => item.status === "PROBLEM"),
    [items]
  );

  const topPriorities = useMemo(() => {
    const eventItems = (calendarState.snapshot?.items || [])
      .filter((item) => item.project_id)
      .slice(0, 3);
    return eventItems.map((item) => ({
      key: item.id,
      title: item.title,
      subtitle: item.starts_at,
      projectId: item.project_id as string,
      eventType: item.event_type,
    }));
  }, [calendarState.snapshot]);

  const todayExecutionItems = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return (calendarState.snapshot?.items || [])
      .filter((item) => item.starts_at.slice(0, 10) === todayKey)
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        title: item.title,
        startsAt: item.starts_at,
        projectId: item.project_id,
        eventType: item.event_type,
      }));
  }, [calendarState.snapshot]);
  const readinessSummary = useMemo(() => {
    const serviceItems = todayExecutionItems.filter((item) => item.eventType.trim().toUpperCase() === "SERVICE").length;
    const linkedPriorityItems = todayExecutionItems.filter((item) => item.projectId).length;
    return {
      serviceItems,
      linkedPriorityItems,
      problemProjects: problemProjects.length,
      pendingSync: pendingCount,
    };
  }, [pendingCount, problemProjects.length, todayExecutionItems]);
  const serviceLaneItems = useMemo(
    () => todayExecutionItems.filter((item) => item.eventType.trim().toUpperCase() === "SERVICE"),
    [todayExecutionItems]
  );

  const earningsInstallTypeSummary = useMemo(
    () => (earningsState.snapshot?.install_types || []).slice(0, 3),
    [earningsState.snapshot]
  );
  const todayDate = new Date().toISOString().slice(0, 10);
  const todayEarningsContext = useMemo(
    () => buildEarningsFocusContext(earningsState.snapshot, todayDate, "TODAY"),
    [earningsState.snapshot, todayDate]
  );
  const dayFocusedEarningsContext = useMemo(
    () => buildEarningsFocusContext(earningsState.snapshot, todayDate, "DAY", todayDate),
    [earningsState.snapshot, todayDate]
  );
  const monthEarningsContext = useMemo(
    () => buildEarningsFocusContext(earningsState.snapshot, todayDate, "MONTH"),
    [earningsState.snapshot, todayDate]
  );
  const workspaceEarningsContext = useMemo(() => {
    if (workspaceEarningsFocus === "MONTH") {
      return monthEarningsContext;
    }
    if (workspaceEarningsFocus === "DAY") {
      return dayFocusedEarningsContext;
    }
    return todayEarningsContext;
  }, [dayFocusedEarningsContext, monthEarningsContext, todayEarningsContext, workspaceEarningsFocus]);

  const lt = (en: string, ru: string, he: string) => {
    if (locale === "ru") return ru;
    if (locale === "he") return he;
    return en;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: installerTheme.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <View style={cardStyle}>
          <View style={{ alignSelf: isRTL ? "flex-end" : "flex-start", marginBottom: 8 }}>
            <LocaleSwitcher />
          </View>
          <Text style={{ color: installerTheme.text, fontSize: 22, fontWeight: "700", textAlign: isRTL ? "right" : "left" }}>{t("workspace.title")}</Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 6, textAlign: isRTL ? "right" : "left" }}>{user?.full_name}</Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 4, textAlign: isRTL ? "right" : "left" }}>{t("workspace.lastSync")}: {lastSyncAt || t("workspace.never")}</Text>
          <Text style={{ color: pendingCount > 0 ? installerTheme.warning : installerTheme.success, marginTop: 4 }}>
            {t("workspace.pendingOffline")}: {pendingCount}
          </Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 4 }}>
            {t("workspace.queueHealth")}: {t("sync.pending")} {queueSummary?.pending || 0} / {t("sync.failed")} {queueSummary?.failed || 0} / {t("sync.blocked")} {queueSummary?.blocked || 0}
          </Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 4 }}>
            {t("workspace.readyNow")}: {queueSummary?.ready_to_send || 0}
            {queueSummary?.next_retry_at ? ` | ${t("sync.nextRetry")} ${queueSummary.next_retry_at}` : ""}
          </Text>
        </View>

        <View style={summaryGridStyle}>
          <View style={summaryCardStyle}>
            <Text style={summaryEyebrowStyle}>{lt("Today tasks", "Задачи на сегодня", "משימות להיום")}</Text>
            <Text style={summaryValueStyle}>{todayTasksCount}</Text>
            <Text style={summaryMetaStyle}>{lt("Source", "Источник", "מקור")}: {translateEnum(locale, calendarState.source)}</Text>
          </View>
          <View style={summaryCardStyle}>
            <Text style={summaryEyebrowStyle}>{lt("Today earnings", "Заработок сегодня", "הכנסות היום")}</Text>
            <Text style={summaryValueStyle}>{earningsState.snapshot?.today_total || "--"}</Text>
            <Text style={summaryMetaStyle}>{lt("Source", "Источник", "מקור")}: {translateEnum(locale, earningsState.source)}</Text>
          </View>
          <View style={summaryCardStyle}>
            <Text style={summaryEyebrowStyle}>{lt("This month", "Этот месяц", "החודש")}</Text>
            <Text style={summaryValueStyle}>{earningsState.snapshot?.month_total || "--"}</Text>
            <Text style={summaryMetaStyle}>{lt("Problem projects", "Проблемные проекты", "פרויקטים עם בעיה")}: {problemProjects.length}</Text>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{lt("Readiness summary", "Сводка готовности", "סיכום מוכנות")}</Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 6 }}>
            {lt(
              "Operational snapshot for today before entering detailed flow.",
              "Операционная сводка дня перед входом в детальный сценарий.",
              "תמונת מצב תפעולית ליום הנוכחי לפני כניסה לזרימה המפורטת."
            )}
          </Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{lt("Service items today", "Сервисные задачи сегодня", "פריטי שירות היום")}</Text>
              <Text style={summaryValueInlineStyle}>{readinessSummary.serviceItems}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{lt("Problem projects", "Проблемные проекты", "פרויקטים עם בעיה")}</Text>
              <Text style={summaryValueInlineStyle}>{readinessSummary.problemProjects}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{lt("Priority items with project", "Приоритеты с проектом", "פריטי עדיפות עם פרויקט")}</Text>
              <Text style={summaryValueInlineStyle}>{readinessSummary.linkedPriorityItems}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{lt("Pending sync work", "Ожидающий синк", "עבודת סנכרון ממתינה")}</Text>
              <Text style={summaryValueInlineStyle}>{readinessSummary.pendingSync}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
            <Pressable onPress={() => router.push("/calendar" as never)} style={[secondaryButton, { flex: 1 }]}>
              <Text style={secondaryButtonText}>{lt("Review calendar", "Проверить календарь", "בדוק יומן")}</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/sync-queue" as never)} style={[secondaryButton, { flex: 1 }]}>
              <Text style={secondaryButtonText}>{lt("Review queue", "Проверить очередь", "בדוק תור")}</Text>
            </Pressable>
          </View>
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{lt("Service lane", "Сервисная линия", "מסלול שירות")}</Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 6 }}>
            {lt(
              "Today service items that require issue-focused follow-up.",
              "Сервисные задачи дня, требующие перехода в контекст проблемы.",
              "פריטי שירות להיום שדורשים המשך טיפול מתוך הקשר תקלה."
            )}
          </Text>
          {serviceLaneItems.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {serviceLaneItems.map((item) => (
                <Pressable
                  key={item.id}
                  style={priorityCardStyle}
                  onPress={() =>
                    item.projectId
                      ? router.push(
                          buildIssueProjectRoute(item.projectId, {
                            doorSearch: item.title,
                          }) as never
                        )
                      : router.push("/calendar" as never)
                  }
                >
                  <Text style={priorityTitleStyle}>{item.title}</Text>
                  <Text style={priorityMetaStyle}>{item.startsAt}</Text>
                  <Text style={priorityMetaStyle}>{item.projectId ? `${t("common.project")}: ${item.projectId}` : t("common.noProject")}</Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <Pressable
                      onPress={() =>
                        item.projectId
                          ? router.push(
                              buildIssueProjectRoute(item.projectId, {
                                doorSearch: item.title,
                              }) as never
                            )
                          : router.push("/calendar" as never)
                      }
                      style={[secondaryButton, { flex: 1 }]}
                    >
                      <Text style={secondaryButtonText}>{lt("Open issue context", "Открыть контекст проблемы", "פתח הקשר תקלה")}</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push("/calendar" as never)} style={[secondaryButton, { flex: 1 }]}>
                      <Text style={secondaryButtonText}>{lt("Open calendar", "Открыть календарь", "פתח יומן")}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={{ color: installerTheme.textMuted, marginTop: 12 }}>
              {lt("No service items in today execution lane.", "В линии дня нет сервисных задач.", "אין פריטי שירות במסלול היום.")}
            </Text>
          )}
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>Earnings by install type</Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 6 }}>
            Read-only breakdown from the current earnings snapshot.
          </Text>
          {earningsInstallTypeSummary.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {earningsInstallTypeSummary.map((item) => (
                <View key={item.code} style={priorityCardStyle}>
                  <Text style={priorityTitleStyle}>{item.label}</Text>
                  <Text style={priorityMetaStyle}>{t("common.amount")}: {item.amount}</Text>
                  <Text style={priorityMetaStyle}>{t("common.quantity")}: {item.quantity}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: installerTheme.textMuted, marginTop: 12 }}>
              No install type earnings breakdown in the current snapshot.
            </Text>
          )}
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{lt("Today earnings lane", "Линия заработка дня", "מסלול הכנסות יומי")}</Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 6 }}>
            {lt(
              "Today money rows from the current read-only earnings snapshot.",
              "Строки денег за день из текущего read-only earnings snapshot.",
              "שורות הכנסה יומיות מתוך תמונת ההכנסות לקריאה בלבד."
            )}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={() => setWorkspaceEarningsFocus("TODAY")}
              style={[chipStyle, workspaceEarningsFocus === "TODAY" && chipStyleActive]}
            >
              <Text style={{ color: workspaceEarningsFocus === "TODAY" ? "#FFFFFF" : installerTheme.textMuted }}>{lt("Today total", "Итог за сегодня", "סה\"כ היום")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setWorkspaceEarningsFocus("DAY")}
              style={[chipStyle, workspaceEarningsFocus === "DAY" && chipStyleActive]}
            >
              <Text style={{ color: workspaceEarningsFocus === "DAY" ? "#FFFFFF" : installerTheme.textMuted }}>{lt("Today rows", "Строки дня", "שורות היום")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setWorkspaceEarningsFocus("MONTH")}
              style={[chipStyle, workspaceEarningsFocus === "MONTH" && chipStyleActive]}
            >
              <Text style={{ color: workspaceEarningsFocus === "MONTH" ? "#FFFFFF" : installerTheme.textMuted }}>{lt("Month", "Месяц", "חודש")}</Text>
            </Pressable>
          </View>
          <View style={{ gap: 8, marginTop: 14 }}>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{lt("Focused total", "Сумма в фокусе", "סה\"כ במיקוד")}</Text>
              <Text style={summaryValueInlineStyle}>
                {workspaceEarningsContext ? `${workspaceEarningsContext.total} ${workspaceEarningsContext.currency}` : "--"}
              </Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>
                {workspaceEarningsFocus === "MONTH"
                  ? lt("Rows this month", "Строк за месяц", "שורות החודש")
                  : lt("Rows in focus", "Строк в фокусе", "שורות במיקוד")}
              </Text>
              <Text style={summaryValueInlineStyle}>{workspaceEarningsContext?.rows.length ?? "--"}</Text>
            </View>
          </View>
          {workspaceEarningsContext?.rows.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {workspaceEarningsContext.rows.slice(0, 3).map((row) => (
                <Pressable
                  key={row.id}
                  style={priorityCardStyle}
                  onPress={() =>
                    row.project_id
                      ? router.push(
                          buildIssueProjectRoute(row.project_id, {
                            doorSearch: row.door_label || row.project_name || undefined,
                          }) as never
                        )
                      : router.push("/earnings" as never)
                  }
                >
                  <Text style={priorityTitleStyle}>{row.project_name || row.install_type_label}</Text>
                  <Text style={priorityMetaStyle}>Door: {row.door_label || "-"}</Text>
                  <Text style={priorityMetaStyle}>Type: {row.install_type_label}</Text>
                  <Text style={priorityMetaStyle}>Amount: {row.amount}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={{ color: installerTheme.textMuted, marginTop: 12 }}>
              {lt(
                "No earnings rows for the current workspace focus.",
                "Для текущего фокуса на workspace нет строк заработка.",
                "אין שורות הכנסה למיקוד הנוכחי במסך העבודה."
              )}
            </Text>
          )}
        </View>

        <View style={cardStyle}>
          <Text style={sectionTitle}>{lt("Today execution lane", "Линия исполнения дня", "מסלול ביצוע יומי")}</Text>
          <Text style={{ color: installerTheme.textMuted, marginTop: 6 }}>
            {lt(
              "Tasks, money and next actions for the current day.",
              "Задачи, деньги и следующие действия на текущий день.",
              "משימות, כסף והפעולות הבאות ליום הנוכחי."
            )}
          </Text>
          <View style={{ gap: 10, marginTop: 14 }}>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{lt("Today tasks", "Задачи на сегодня", "משימות להיום")}</Text>
              <Text style={summaryValueInlineStyle}>{todayTasksCount}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{lt("Today earnings", "Заработок сегодня", "הכנסות היום")}</Text>
              <Text style={summaryValueInlineStyle}>{earningsState.snapshot?.today_total || "--"}</Text>
            </View>
            <View style={summaryRowStyle}>
              <Text style={summaryLabelStyle}>{lt("Priority events", "Приоритетные события", "אירועי עדיפות")}</Text>
              <Text style={summaryValueInlineStyle}>{todayExecutionItems.length}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
            <Pressable onPress={() => router.push("/calendar" as never)} style={[secondaryButton, { flex: 1 }]}>
              <Text style={secondaryButtonText}>{lt("Today calendar", "Календарь дня", "יומן היום")}</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/earnings" as never)} style={[secondaryButton, { flex: 1 }]}>
              <Text style={secondaryButtonText}>{lt("Today earnings", "Заработок дня", "הכנסות היום")}</Text>
            </Pressable>
          </View>
          {todayExecutionItems.length ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {todayExecutionItems.map((item) => (
                <Pressable
                  key={item.id}
                  style={priorityCardStyle}
                  onPress={() =>
                    item.projectId
                      ? router.push(buildPriorityRoute({
                          projectId: item.projectId,
                          eventType: item.eventType,
                          title: item.title,
                        }) as never)
                      : router.push("/calendar" as never)
                  }
                >
                  <Text style={priorityTitleStyle}>{item.title}</Text>
                  <Text style={priorityMetaStyle}>{item.startsAt}</Text>
                  <Text style={priorityMetaStyle}>
                    {item.projectId ? `${t("common.project")}: ${item.projectId}` : t("common.noProject")}
                  </Text>
                  <Text style={priorityMetaStyle}>{t("common.type")}: {translateEnum(locale, item.eventType)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={{ color: installerTheme.textMuted, marginTop: 12 }}>
              {lt(
                "No same-day execution events in the current calendar snapshot.",
                "В текущем calendar snapshot нет событий этого дня.",
                "אין אירועי ביצוע של אותו יום בתמונת היומן הנוכחית."
              )}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={hydrate} style={[primaryButton, busy && { opacity: 0.6 }]} disabled={busy}>
            <Text style={primaryButtonText}>{busy ? t("common.working") : lt("Bootstrap", "Бутстрап", "Bootstrap")}</Text>
          </Pressable>
          <Pressable onPress={syncNow} style={[secondaryButton, busy && { opacity: 0.6 }]} disabled={busy}>
            <Text style={secondaryButtonText}>{lt("Sync Now", "Синхронизировать", "סנכרן עכשיו")}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={() => router.push("/calendar" as never)} style={secondaryButton}>
            <Text style={secondaryButtonText}>{t("title.calendar")}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/earnings" as never)} style={secondaryButton}>
            <Text style={secondaryButtonText}>{t("title.earnings")}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={() => router.push("/sync-queue" as never)} style={secondaryButton}>
            <Text style={secondaryButtonText}>{lt("Queue", "Очередь", "תור")}</Text>
          </Pressable>
          <Pressable onPress={signOut} style={secondaryButton}>
            <Text style={secondaryButtonText}>{t("common.logout")}</Text>
          </Pressable>
        </View>

        {error ? <Text style={{ color: installerTheme.danger }}>{error}</Text> : null}

        <View style={cardStyle}>
          <Text style={sectionTitle}>{lt("Today priorities", "Приоритеты дня", "עדיפויות היום")}</Text>
          {topPriorities.length ? (
            topPriorities.map((item) => (
              <Pressable
                key={item.key}
                style={priorityCardStyle}
                onPress={() =>
                  router.push(buildPriorityRoute(item) as never)
                }
              >
                <Text style={priorityTitleStyle}>{item.title}</Text>
                <Text style={priorityMetaStyle}>{item.subtitle}</Text>
                <Text style={priorityMetaStyle}>{t("common.project")}: {item.projectId}</Text>
                <Text style={priorityMetaStyle}>{t("common.type")}: {translateEnum(locale, item.eventType)}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={{ color: installerTheme.textMuted, marginTop: 8 }}>
              {lt(
                "No priority events in the current calendar snapshot.",
                "В текущем calendar snapshot нет приоритетных событий.",
                "אין אירועי עדיפות בתמונת היומן הנוכחית."
              )}
            </Text>
          )}
        </View>

        {problemProjects.length ? (
          <View style={cardStyle}>
            <Text style={sectionTitle}>{lt("Problem projects lane", "Линия проблемных проектов", "מסלול פרויקטים בעייתיים")}</Text>
            <Text style={{ color: installerTheme.textMuted, marginTop: 6 }}>
              {lt(
                "Fast recovery entry for projects that need attention now.",
                "Быстрый вход в восстановление для проектов, которым нужно внимание прямо сейчас.",
                "כניסה מהירה לשחזור עבור פרויקטים שדורשים תשומת לב עכשיו."
              )}
            </Text>
            {problemProjects.slice(0, 3).map((item) => (
              <View key={item.id} style={priorityCardStyle}>
                <Pressable onPress={() => router.push(buildProblemProjectRoute(item) as never)}>
                  <Text style={priorityTitleStyle}>{item.name}</Text>
                  <Text style={priorityMetaStyle}>{item.address || t("project.noAddress")}</Text>
                  <Text style={[priorityMetaStyle, { color: installerTheme.warning }]}>{lt("Open issues context", "Открыть контекст проблем", "פתח הקשר תקלות")}</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable
                    onPress={() => router.push(buildProblemProjectRoute(item) as never)}
                    style={[secondaryButton, { flex: 1 }]}
                  >
                    <Text style={secondaryButtonText}>{lt("Issue context", "Контекст проблем", "הקשר תקלות")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push(`/earnings?focus=MONTH` as never)}
                    style={[secondaryButton, { flex: 1 }]}
                  >
                    <Text style={secondaryButtonText}>{lt("Earnings context", "Контекст заработка", "הקשר הכנסות")}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          {items.map((item) => (
            <View key={item.id} style={cardStyle}>
              <Pressable onPress={() => router.push(buildProjectRoute(item.id) as never)}>
                <Text style={{ color: installerTheme.text, fontSize: 18, fontWeight: "600" }}>{item.name}</Text>
                <Text style={{ color: installerTheme.textMuted, marginTop: 6 }}>{item.address || lt("No address", "Нет адреса", "אין כתובת")}</Text>
                <Text style={{ color: item.status === "PROBLEM" ? installerTheme.warning : installerTheme.success, marginTop: 8 }}>{translateEnum(locale, item.status)}</Text>
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable onPress={() => router.push(buildProjectRoute(item.id) as never)} style={[secondaryButton, { flex: 1 }]}>
                  <Text style={secondaryButtonText}>{lt("Open project", "Открыть проект", "פתח פרויקט")}</Text>
                </Pressable>
                {item.status === "PROBLEM" ? (
                  <Pressable
                    onPress={() => router.push(buildIssueProjectRoute(item.id, { doorSearch: item.name }) as never)}
                    style={[secondaryButton, { flex: 1 }]}
                  >
                    <Text style={secondaryButtonText}>{lt("Open issues", "Открыть проблемы", "פתח תקלות")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {!items.length ? (
            <View style={cardStyle}>
              <Text style={{ color: installerTheme.textMuted }}>
                {lt(
                  "No local projects yet. Use Bootstrap to pull assigned projects and seed offline storage.",
                  "Локальных проектов пока нет. Используй Bootstrap, чтобы подтянуть назначенные проекты и заполнить offline-хранилище.",
                  "עדיין אין פרויקטים מקומיים. השתמש ב-Bootstrap כדי למשוך פרויקטים משויכים ולמלא את אחסון האופליין."
                )}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: installerTheme.card,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: installerTheme.border,
  padding: 18,
} as const;

const primaryButton = {
  flex: 1,
  backgroundColor: installerTheme.primary,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
} as const;

const secondaryButton = {
  flex: 1,
  backgroundColor: installerTheme.cardMuted,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: installerTheme.border,
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
} as const;

const primaryButtonText = {
  color: "#FFFFFF",
  fontWeight: "700",
} as const;

const secondaryButtonText = {
  color: installerTheme.text,
  fontWeight: "600",
} as const;

const summaryGridStyle = {
  gap: 12,
} as const;

const summaryCardStyle = {
  backgroundColor: installerTheme.cardMuted,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: installerTheme.border,
  padding: 16,
} as const;

const summaryEyebrowStyle = {
  color: installerTheme.textMuted,
  fontSize: 12,
  textTransform: "uppercase",
} as const;

const summaryValueStyle = {
  color: installerTheme.text,
  fontSize: 24,
  fontWeight: "700",
  marginTop: 8,
} as const;

const summaryMetaStyle = {
  color: installerTheme.textMuted,
  marginTop: 6,
} as const;

const sectionTitle = {
  color: installerTheme.text,
  fontSize: 18,
  fontWeight: "700",
} as const;

const priorityCardStyle = {
  backgroundColor: installerTheme.cardMuted,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: installerTheme.border,
  padding: 14,
  marginTop: 10,
} as const;

const priorityTitleStyle = {
  color: installerTheme.text,
  fontSize: 15,
  fontWeight: "700",
} as const;

const priorityMetaStyle = {
  color: installerTheme.textMuted,
  marginTop: 6,
} as const;

const chipStyle = {
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: installerTheme.border,
  backgroundColor: installerTheme.cardMuted,
} as const;

const chipStyleActive = {
  backgroundColor: installerTheme.primary,
  borderColor: installerTheme.primary,
} as const;

const summaryRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const summaryLabelStyle = {
  color: installerTheme.textMuted,
} as const;

const summaryValueInlineStyle = {
  color: "#FFFFFF",
  fontWeight: "700",
} as const;
