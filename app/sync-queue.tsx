import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import {
  ActionButton,
  BrandText as Text,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { Reveal } from "@/components/motion";
import { translateEnum } from "@/lib/i18n";
import { getDatabaseContext, withDatabaseContext } from "@/lib/db";
import { installerTheme, toneColors, type InstallerTone } from "@/lib/theme";
import { getProject, listProjects, listProjectDoors, listProjectAddonTypes } from "@/modules/projects/repository";
import { buildDoorProjectRoute, buildProjectRoute } from "@/modules/projects/navigation";
import { MAX_AUTO_RETRY_ATTEMPTS } from "@/modules/sync/policy";
import {
  buildEventSummary,
  buildQueueResolution,
  canRetrySyncEvent,
  getQueueReadState,
  needsSyncAttention,
} from "@/modules/sync/presentation";
import {
  dropPendingEvent,
  getLastSyncAt,
  getSyncQueueSummary,
  listPendingEvents,
  retryPendingEventNow,
  runSync,
} from "@/modules/sync/service";
import type { PendingSyncEvent, SyncQueueSummary } from "@/modules/sync/types";
import { useAuth, useI18n } from "@/providers/AppProviders";

type QueueFilter = "ALL" | "ATTENTION" | "WAITING";

export default function SyncQueueScreen() {
  const { user, loading: authLoading, syncVersion } = useAuth();
  const ownerKey = user ? `${user.company_id}:${user.id}` : "";
  return <SyncQueueWorkspace key={ownerKey} ownerKey={ownerKey} authLoading={authLoading} syncVersion={syncVersion} />;
}

type EventLabels = { doorLabel?: string; addonLabel?: string; route?: string };

function SyncQueueWorkspace({ ownerKey, authLoading, syncVersion }: { ownerKey: string; authLoading: boolean; syncVersion: number }) {
  const { locale } = useI18n();
  const [items, setItems] = useState<PendingSyncEvent[]>([]);
  const [summary, setSummary] = useState<SyncQueueSummary | null>(null);
  const [eventLabels, setEventLabels] = useState<Record<string, EventLabels>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const actionLock = useRef(false);
  const focused = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [dropCandidate, setDropCandidate] = useState<PendingSyncEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const readRequest = useRef(0);
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";

  const reload = useCallback(async (): Promise<boolean> => {
    if (authLoading || !ownerKey) return false;
    const context = getDatabaseContext();
    const request = ++readRequest.current;
    setReading(true);
    setReadFailed(false);
    try {
      const { pending, queueSummary, names, labels, syncAt } = await withDatabaseContext(context, async () => {
        if (context?.ownerKey !== ownerKey) throw new Error("Session changed");
        const [pending, queueSummary, projects, syncAt] = await Promise.all([
          listPendingEvents(),
          getSyncQueueSummary(),
          listProjects(),
          getLastSyncAt(),
        ]);
        const missingIds = pending
          .map((event) => event.project_id)
          .filter((projectId) => !projects.some((project) => project.id === projectId));
        const extraProjects = await Promise.all(
          Array.from(new Set(missingIds)).map(async (projectId) => getProject(projectId))
        );
        const names = Object.fromEntries(
          [...projects, ...extraProjects.filter(Boolean)].map((project) => [project!.id, project!.name])
        );
        const labels: Record<string, EventLabels> = {};
        for (const projectId of new Set(pending.map((item) => item.project_id))) {
          const projectEvents = pending.filter((item) => item.project_id === projectId);
          const [doors, addons] = await Promise.all([
            projectEvents.some((item) => typeof item.payload.door_id === "string") ? listProjectDoors(projectId) : [],
            projectEvents.some((item) => item.type === "ADDON_FACT_CREATE") ? listProjectAddonTypes(projectId) : [],
          ]);
          for (const item of projectEvents) {
            const door = doors.find((row) => row.id === item.payload.door_id);
            const addon = addons.find((row) => row.id === item.payload.addon_type_id);
            labels[item.client_event_id] = {
              doorLabel: door?.unit_label, addonLabel: addon?.name,
              route: door ? buildDoorProjectRoute(projectId, door.id)
                : item.type === "ADDON_FACT_CREATE" && projects.some((row) => row.id === projectId) ? buildProjectRoute(projectId) : undefined,
            };
          }
        }
        return { pending, queueSummary, names, labels, syncAt };
      });
      if (!focused.current || request !== readRequest.current || context !== getDatabaseContext()) return false;
      const priority = { BLOCKED: 0, FAILED: 1, PENDING: 2 } as const;
      pending.sort((left, right) =>
        priority[left.status] - priority[right.status] || right.created_at.localeCompare(left.created_at)
      );
      setItems(pending);
      setSummary(queueSummary);
      setProjectNames(names);
      setEventLabels(labels);
      setLastSyncAt(syncAt);
      return true;
    } catch {
      if (focused.current && request === readRequest.current) {
        setReadFailed(true);
        setSummary(null);
        setItems([]);
      }
      return false;
    } finally {
      if (focused.current && request === readRequest.current) setReading(false);
    }
  }, [authLoading, ownerKey]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void reload();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => { focused.current = false; readRequest.current += 1; subscription.remove(); };
  }, [reload, syncVersion]));

  const readState = getQueueReadState(summary, reading || authLoading, readFailed);
  const queueReady = readState === "ready";
  const queueLoading = readState === "loading";
  const attentionCount = items.filter(needsSyncAttention).length;
  const waitingCount = items.length - attentionCount;
  const retryableBlocked = items.filter((item) => item.status === "BLOCKED" && canRetrySyncEvent(item));
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "ATTENTION") return needsSyncAttention(item);
        if (filter === "WAITING") return !needsSyncAttention(item);
        return true;
      }),
    [filter, items]
  );

  const timeLabel = (value: string | null) => {
    if (!value) return lt("never", "ещё не было", "עדיין לא");
    if (!Number.isFinite(Date.parse(value))) return lt("Unknown time", "Время неизвестно", "זמן לא ידוע");
    return new Intl.DateTimeFormat(intlLocale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const eventTitle = (item: PendingSyncEvent) => buildEventSummary(item, locale, {
    doorLabel: eventLabels[item.client_event_id]?.doorLabel || lt("unavailable", "недоступна", "לא זמינה"),
    addonLabel: eventLabels[item.client_event_id]?.addonLabel || lt("unavailable", "недоступна", "לא זמינה"),
  });

  const perform = async (kind: "sync" | "retry" | "retry-blocked" | "drop", id?: string) => {
    if (actionLock.current || !queueReady || !focused.current || !alive.current) return;
    const context = getDatabaseContext();
    if (!context || context.ownerKey !== ownerKey) return;
    actionLock.current = true;
    setBusy(id || kind);
    setError(null);
    const current = () => alive.current && context === getDatabaseContext();
    try {
      let shouldSync = kind === "sync";
      if (kind !== "sync") {
        // Pin short local reads/writes to this account; never hold the DB queue during a network request.
        shouldSync = await withDatabaseContext(context, async () => {
          if (!alive.current) return false;
          const fresh = await listPendingEvents();
          const targets = kind === "retry-blocked"
            ? fresh.filter((item) => retryableBlocked.some((old) => old.client_event_id === item.client_event_id)
              && item.status === "BLOCKED" && canRetrySyncEvent(item))
            : fresh.filter((item) => item.client_event_id === id);
          for (const item of targets) {
            const resolution = buildQueueResolution(item);
            if (kind === "drop" ? !resolution.dropAllowed : !resolution.retryAllowed) {
              throw new Error(lt("This action changed. Review the refreshed queue.", "Действие изменилось. Проверьте обновлённую очередь.", "הפעולה השתנתה. בדקו את התור המעודכן."));
            }
            if (kind === "drop") await dropPendingEvent(item.client_event_id);
            else await retryPendingEventNow(item.client_event_id);
          }
          return kind !== "drop" && targets.length > 0;
        });
      }
      if (shouldSync && current() && focused.current) await runSync({ forceRetry: true });
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : lt("Unable to complete action", "Не удалось выполнить действие", "לא ניתן להשלים את הפעולה"));
    } finally {
      if (current()) {
        setDropCandidate(null);
        if (focused.current) await reload();
        setBusy(null);
      }
      actionLock.current = false;
    }
  };

  const confirmDrop = (item: PendingSyncEvent) => {
    if (!actionLock.current && queueReady && buildQueueResolution(item).dropAllowed) setDropCandidate(item);
  };

  return (
    <SafeAreaView style={[styles.screen, { direction: locale === "he" ? "rtl" : "ltr" }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>{lt("SAVED ON THIS PHONE", "СОХРАНЕНО НА ТЕЛЕФОНЕ", "נשמר במכשיר הזה")}</Text>
              <Text style={styles.title}>{lt("Sync queue", "Синхронизация", "תור סנכרון")}</Text>
            </View>
            <IconButton icon="refresh" label={lt("Refresh queue", "Обновить очередь", "רענון התור")}
              tone="dark" onPress={() => { if (!actionLock.current) void reload(); }}
              disabled={queueLoading || Boolean(busy) || !ownerKey} />
          </View>
          <Text style={styles.lastSync}>{lt("Last sync", "Последняя синхронизация", "סנכרון אחרון")}: {timeLabel(lastSyncAt)}</Text>
          <View style={styles.connectionRow}>
            <View style={[styles.connectionIcon, { backgroundColor: !queueReady || attentionCount ? installerTheme.warningGlow : installerTheme.successGlow }]}>
              <Ionicons
                name={queueLoading ? "hourglass-outline" : !queueReady || attentionCount ? "warning-outline" : "cloud-done-outline"}
                size={21}
                color={!queueReady || attentionCount ? installerTheme.warningFill : installerTheme.successFill}
              />
            </View>
            <View style={styles.connectionBody}>
              <Text style={[styles.connectionTitle, { color: !queueReady || attentionCount ? installerTheme.warningFill : installerTheme.successFill }]}>
                {queueLoading
                  ? lt("Reading queue", "Читаем очередь", "קוראים את התור")
                  : !queueReady
                    ? lt("Queue unavailable", "Очередь недоступна", "התור אינו זמין")
                    : attentionCount
                  ? lt("Queue needs attention", "Очередь требует внимания", "התור דורש טיפול")
                  : summary?.total
                    ? lt("Work is stored safely", "Работы сохранены на телефоне", "העבודה שמורה במכשיר")
                    : lt("No queued actions", "Нет действий в очереди", "אין פעולות בתור")}
              </Text>
              <Text style={styles.connectionMeta}>
                {lt(
                  "Offline actions stay on this phone until the server accepts them.",
                  "Офлайн-действия остаются на телефоне, пока сервер их не примет.",
                  "פעולות לא מקוונות נשמרות במכשיר עד שהשרת מקבל אותן."
                )}
              </Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <HeroStat label={lt("Queued", "В очереди", "בתור")} value={queueReady ? summary!.pending : "--"} tone="accent" />
            <HeroStat label={lt("Failed", "Ошибки", "נכשל")} value={queueReady ? summary!.failed : "--"} tone="warning" />
            <HeroStat label={lt("Blocked", "Блоки", "חסום")} value={queueReady ? summary!.blocked : "--"} tone="danger" />
            <HeroStat label={lt("Ready to send", "К отправке", "מוכן לשליחה")} value={queueReady ? summary!.ready_to_send : "--"} tone="success" />
          </View>
        </View>

        <View style={styles.body}>
          {error ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: lt("All", "Все", "הכול"), count: queueReady ? items.length : undefined },
              { value: "ATTENTION", label: lt("Attention", "Внимание", "דורש טיפול"), count: queueReady ? attentionCount : undefined },
              { value: "WAITING", label: lt("Waiting", "Ожидают", "ממתין"), count: queueReady ? waitingCount : undefined },
            ]}
          />

          <View style={styles.bulkActions}>
            <ActionButton
              label={busy === "sync" || busy === "retry-blocked" ? lt("Synchronizing…", "Синхронизация…", "מסנכרן…") : lt("Sync now", "Синхронизировать", "סנכרון עכשיו")}
              icon="cloud-upload-outline"
              loading={busy === "sync" || busy === "retry-blocked"}
              disabled={!queueReady || Boolean(busy)}
              style={styles.flex}
              onPress={() => void perform("sync")}
            />
            {retryableBlocked.length ? (
              <IconButton
                icon="repeat"
                label={lt("Retry blocked actions", "Повторить заблокированные", "ניסיון חוזר לפעולות חסומות")}
                onPress={() => void perform("retry-blocked")}
                disabled={!queueReady || Boolean(busy)}
              />
            ) : null}
          </View>

          {!queueReady ? (
            <SectionCard>
              <EmptyState
                icon={queueLoading ? "hourglass-outline" : "alert-circle-outline"}
                title={queueLoading
                  ? lt("Loading queue", "Загружаем очередь", "טוענים את התור")
                  : lt("Unable to read queue", "Не удалось прочитать очередь", "לא ניתן לקרוא את התור")}
                description={queueLoading
                  ? lt("Reading saved actions on this phone.", "Читаем сохранённые действия на телефоне.", "קוראים את הפעולות השמורות במכשיר.")
                  : lt("Refresh the queue. Saved actions have not been deleted.", "Обновите очередь. Сохранённые действия не удалены.", "רעננו את התור. הפעולות השמורות לא נמחקו.")}
              />
            </SectionCard>
          ) : visibleItems.length ? (
            <View style={styles.queueList}>
              <SectionHeader title={lt("Queued actions", "Действия в очереди", "פעולות בתור")} meta={visibleItems.length} />
              {visibleItems.map((item) => (
                <QueueCard
                  key={item.client_event_id}
                  item={item}
                  locale={locale}
                  projectName={projectNames[item.project_id] || lt("Project unavailable", "Объект недоступен", "הפרויקט אינו זמין")}
                  title={eventTitle(item)}
                  labels={eventLabels[item.client_event_id]}
                  busy={Boolean(busy)}
                  working={busy === item.client_event_id}
                  timeLabel={timeLabel}
                  retryLabel={lt("Retry now", "Повторить", "ניסיון נוסף")}
                  discardLabel={lt("Discard", "Удалить", "מחיקה")}
                  onRetry={() => void perform("retry", item.client_event_id)}
                  onDrop={() => confirmDrop(item)}
                />
              ))}
            </View>
          ) : (
            <SectionCard>
              <EmptyState
                icon="cloud-done-outline"
                title={filter === "ALL" ? lt("Queue is empty", "Очередь пуста", "התור ריק") : lt("Nothing in this filter", "В этом фильтре ничего нет", "אין פריטים במסנן")}
                description={filter === "ALL"
                  ? lt("No unsent actions on this phone.", "На телефоне нет неотправленных действий.", "אין פעולות שלא נשלחו במכשיר זה.")
                  : lt("Choose another filter to see saved actions.", "Выберите другой фильтр, чтобы увидеть сохранённые действия.", "בחרו מסנן אחר כדי לראות פעולות שמורות.")}
              />
            </SectionCard>
          )}
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={Boolean(dropCandidate)}
        title={lt("Discard queued action?", "Удалить действие из очереди?", "למחוק פעולה מהתור?")}
        direction={locale === "he" ? "rtl" : "ltr"}
        message={`${dropCandidate ? `${projectNames[dropCandidate.project_id] || ""}\n${eventTitle(dropCandidate)}\n\n` : ""}${lt(
          "Its optimistic local change will also be removed. This cannot be undone.",
          "Связанное локальное изменение тоже будет отменено. Это действие нельзя вернуть.",
          "גם השינוי המקומי יבוטל. לא ניתן לשחזר פעולה זו."
        )}`}
        confirmLabel={lt("Discard", "Удалить", "מחיקה")}
        cancelLabel={lt("Cancel", "Отмена", "ביטול")}
        danger
        confirmIcon="trash-outline"
        busy={Boolean(busy)}
        onCancel={() => { if (!actionLock.current) setDropCandidate(null); }}
        onConfirm={() => {
          if (!dropCandidate) return;
          void perform("drop", dropCandidate.client_event_id);
        }}
      />
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: number | string; tone: InstallerTone }) {
  const colors = toneColors(tone);
  return (
    <View style={styles.heroStat}>
      <Text style={[styles.heroStatValue, { color: colors.text }]}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function QueueCard({
  item,
  locale,
  projectName,
  title,
  labels,
  busy,
  working,
  timeLabel,
  retryLabel,
  discardLabel,
  onRetry,
  onDrop,
}: {
  item: PendingSyncEvent;
  locale: "en" | "ru" | "he";
  projectName: string;
  title: string;
  labels?: EventLabels;
  busy: boolean;
  working: boolean;
  timeLabel: (value: string | null) => string;
  retryLabel: string;
  discardLabel: string;
  onRetry: () => void;
  onDrop: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const lt = (en: string, ru: string, he: string) => locale === "ru" ? ru : locale === "he" ? he : en;
  const resolution = buildQueueResolution(item, locale);
  const tone: InstallerTone = item.status === "BLOCKED" ? "danger" : needsSyncAttention(item) ? "warning" : "neutral";
  const colors = toneColors(tone);
  const icon =
    item.type === "DOOR_SET_STATUS"
      ? "checkmark-circle-outline"
      : item.type === "ISSUE_CREATE"
        ? "alert-circle-outline"
        : "add-circle-outline";

  return (
    <Reveal><SectionCard style={styles.queueCard}>
      <View style={[styles.queueStrip, { backgroundColor: colors.text }]} />
      <View style={styles.queueHeader}>
        <View style={[styles.queueIcon, { backgroundColor: colors.background }]}>
          <Ionicons name={icon} size={18} color={colors.text} />
        </View>
        <View style={styles.queueBody}>
          <Text style={styles.queueMeta}>{projectName}</Text>
          <Text style={styles.queueTitle}>{title}</Text>
        </View>
      </View>
      <View style={styles.queueStatus}><StatusPill label={translateEnum(locale, item.status)} tone={tone} /></View>
      <View style={styles.resolution}>
        <Text style={[styles.resolutionTitle, { color: colors.text }]}>{resolution.title}</Text>
        <Text style={styles.resolutionDetail}>{resolution.detail}</Text>
        <Text style={styles.resolutionAction}>{resolution.action}</Text>
      </View>
      <View style={styles.queueFacts}>
        <Text style={styles.queueFact}>{lt("Saved", "Сохранено", "נשמר")}: {timeLabel(item.created_at)}</Text>
        <Text style={styles.queueFact}>{lt("Attempts", "Попытки", "ניסיונות")}: {item.attempts}</Text>
        {item.status === "FAILED" && item.attempts < MAX_AUTO_RETRY_ATTEMPTS && item.next_retry_at
          ? <Text style={styles.queueFact}>{lt("Next retry", "Следующий повтор", "ניסיון הבא")}: {timeLabel(item.next_retry_at)}</Text>
          : null}
      </View>
      <View style={styles.itemActions}>
        {resolution.retryAllowed ? <ActionButton
          label={retryLabel}
          icon="refresh"
          variant="dark"
          loading={working}
          disabled={busy || !resolution.retryAllowed}
          style={styles.flex}
          onPress={onRetry}
        /> : null}
        {resolution.dropAllowed ? <ActionButton
          label={discardLabel}
          icon="trash-outline"
          variant="danger"
          disabled={busy || !resolution.dropAllowed}
          style={styles.flex}
          onPress={onDrop}
        /> : null}
      </View>
      <View style={styles.itemActions}>
        {labels?.route ? <IconButton icon="open-outline" label={lt("Open linked work", "Открыть работу", "פתיחת העבודה")}
          disabled={busy} onPress={() => { if (!busy && labels.route) router.push(labels.route as never); }} /> : null}
        <ActionButton label={detailsOpen ? lt("Hide details", "Скрыть детали", "הסתרת פרטים") : lt("Technical details", "Технические детали", "פרטים טכניים")}
          icon={detailsOpen ? "chevron-up" : "chevron-down"} variant="secondary" style={styles.flex}
          onPress={() => setDetailsOpen((value) => !value)} />
      </View>
      {detailsOpen ? <View style={styles.technical}>
        <Text selectable style={styles.queueFact}>ID: {item.client_event_id}</Text>
        <Text selectable style={styles.queueFact}>{lt("Executed at", "Время выполнения", "זמן הביצוע")}: {item.happened_at || lt("Not recorded", "Не записано", "לא נרשם")}</Text>
        {item.type === "ADDON_FACT_CREATE" || (item.type === "DOOR_SET_STATUS" && item.payload.status === "INSTALLED")
          ? <Text selectable style={styles.queueFact}>{lt("Execution price list ID", "ID прайса при выполнении", "מזהה המחירון בעת הביצוע")}: {typeof item.payload.price_list_id === "string"
            ? item.payload.price_list_id : lt("Not recorded", "Не записано", "לא נרשם")}</Text> : null}
        {typeof item.payload.door_id === "string" ? <Text selectable style={styles.queueFact}>{lt("Door ID", "ID двери", "מזהה דלת")}: {item.payload.door_id}</Text> : null}
        {item.error ? <Text selectable style={styles.queueFact}>{item.error}</Text> : null}
      </View> : null}
    </SectionCard></Reveal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  content: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  eyebrow: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, fontWeight: "700" },
  title: { color: installerTheme.text, fontSize: 24, fontWeight: "800", marginTop: 6 },
  lastSync: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 17 },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  connectionRow: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 12 },
  connectionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
  },
  connectionBody: { flex: 1, minWidth: 0 },
  connectionTitle: { fontSize: 13, fontWeight: "800" },
  connectionMeta: { color: installerTheme.textFaint, fontSize: 12, lineHeight: 18, marginTop: 4 },
  heroStats: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: installerTheme.radius.card,
    backgroundColor: installerTheme.shellOverlaySubtle,
    marginTop: 10,
  },
  heroStat: { flex: 1, alignItems: "center", paddingHorizontal: 4, paddingVertical: 10 },
  heroStatValue: { fontFamily: installerTheme.fontFamilyMono, fontSize: 20 },
  heroStatLabel: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, lineHeight: 16, textAlign: "center", marginTop: 4 },
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
  errorText: { flex: 1, color: installerTheme.danger, fontSize: 12, lineHeight: 18 },
  bulkActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  queueList: { gap: 12 },
  queueCard: { position: "relative", overflow: "hidden", paddingStart: 17, borderColor: installerTheme.borderStrong },
  queueStrip: { position: "absolute", top: 0, bottom: 0, start: 0, width: 3 },
  queueHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  queueIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.md,
  },
  queueBody: { flex: 1, minWidth: 0 },
  queueTitle: { color: installerTheme.text, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  queueMeta: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  queueStatus: { alignSelf: "flex-start", marginTop: 10 },
  resolution: { borderTopWidth: 1, borderColor: installerTheme.border, paddingTop: 12, marginTop: 12 },
  technical: { gap: 6, marginTop: 12, borderTopWidth: 1, borderColor: installerTheme.border, paddingTop: 12 },
  resolutionTitle: { fontSize: 13, fontWeight: "800" },
  resolutionDetail: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  resolutionAction: { color: installerTheme.text, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 6 },
  queueFacts: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 9 },
  queueFact: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, lineHeight: 17 },
  itemActions: { flexDirection: "row", gap: 7, marginTop: 11 },
  flex: { flex: 1 },
});
