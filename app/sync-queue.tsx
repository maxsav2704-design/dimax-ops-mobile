import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import {
  ActionButton,
  BrandText as Text,
  ConfirmDialog,
  EmptyState,
  IconButton,
  ScreenHero,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { translateEnum } from "@/lib/i18n";
import { getDatabaseContext, withDatabaseContext } from "@/lib/db";
import { installerTheme, toneColors, type InstallerTone } from "@/lib/theme";
import { getProject, listProjects } from "@/modules/projects/repository";
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
  const { locale } = useI18n();
  const { user, loading: authLoading, syncVersion } = useAuth();
  const [items, setItems] = useState<PendingSyncEvent[]>([]);
  const [summary, setSummary] = useState<SyncQueueSummary | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dropCandidate, setDropCandidate] = useState<PendingSyncEvent | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const readRequest = useRef(0);
  const companyId = user?.company_id;
  const userId = user?.id;
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";

  const reload = useCallback(async (): Promise<boolean> => {
    if (authLoading || !companyId || !userId) return false;
    const request = ++readRequest.current;
    setReading(true);
    setReadFailed(false);
    try {
      const { pending, queueSummary, names, syncAt } = await withDatabaseContext(getDatabaseContext(), async () => {
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
        return { pending, queueSummary, names, syncAt };
      });
      if (request !== readRequest.current) return false;
      const priority = { BLOCKED: 0, FAILED: 1, PENDING: 2 } as const;
      pending.sort((left, right) =>
        priority[left.status] - priority[right.status] || right.created_at.localeCompare(left.created_at)
      );
      setItems(pending);
      setSummary(queueSummary);
      setProjectNames(names);
      setLastSyncAt(syncAt);
      return true;
    } catch {
      if (request === readRequest.current) {
        setReadFailed(true);
        setSummary(null);
        setItems([]);
      }
      return false;
    } finally {
      if (request === readRequest.current) setReading(false);
    }
  }, [authLoading, companyId, userId]);

  useEffect(() => {
    setItems([]);
    setSummary(null);
    setProjectNames({});
    setLastSyncAt(null);
    setError(null);
    setReadFailed(false);
    setReading(authLoading || Boolean(userId));
    void reload();
    return () => { readRequest.current += 1; };
  }, [authLoading, reload, syncVersion, userId]);

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
    return new Intl.DateTimeFormat(intlLocale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const retryItem = async (clientEventId: string) => {
    setBusyId(clientEventId);
    setError(null);
    try {
      await retryPendingEventNow(clientEventId);
      await runSync({ forceRetry: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Retry failed", "Повтор не выполнен", "הניסיון נכשל"));
    } finally {
      await reload();
      setBusyId(null);
    }
  };

  const confirmDrop = (item: PendingSyncEvent) => setDropCandidate(item);

  const dropItem = async (clientEventId: string) => {
    setBusyId(clientEventId);
    setError(null);
    try {
      await dropPendingEvent(clientEventId);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Unable to discard action", "Не удалось удалить действие", "לא ניתן למחוק את הפעולה"));
    } finally {
      setBusyId(null);
    }
  };

  const syncNow = async () => {
    setBulkBusy(true);
    setError(null);
    try {
      const response = await runSync({ forceRetry: true });
      await reload();
      setLastSyncAt(response.server_time);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Sync failed", "Синхронизация не выполнена", "הסנכרון נכשל"));
      await reload();
    } finally {
      setBulkBusy(false);
    }
  };

  const retryBlockedNow = async () => {
    if (!retryableBlocked.length) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const item of retryableBlocked) await retryPendingEventNow(item.client_event_id);
      const response = await runSync({ forceRetry: true });
      await reload();
      setLastSyncAt(response.server_time);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Bulk retry failed", "Повтор очереди не выполнен", "הניסיון החוזר נכשל"));
      await reload();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          showMark={false}
          eyebrow={lt("OFFLINE QUEUE", "ОФЛАЙН-ОЧЕРЕДЬ", "תור לא מקוון")}
          title={lt("Sync status", "Состояние синхронизации", "מצב סנכרון")}
          subtitle={`${lt("Last sync", "Последняя синхронизация", "סנכרון אחרון")}: ${timeLabel(lastSyncAt)}`}
          right={
            <IconButton
              icon="refresh"
              label={lt("Refresh queue", "Обновить очередь", "רענון התור")}
              tone="dark"
              onPress={() => void reload()}
              disabled={queueLoading || !userId}
            />
          }
        >
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
        </ScreenHero>

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
              label={bulkBusy ? lt("Synchronizing…", "Синхронизация…", "מסנכרן…") : lt("Sync now", "Синхронизировать", "סנכרון עכשיו")}
              icon="cloud-upload-outline"
              loading={bulkBusy}
              disabled={!queueReady || bulkBusy || !items.length}
              style={styles.flex}
              onPress={() => void syncNow()}
            />
            {retryableBlocked.length ? (
              <IconButton
                icon="repeat"
                label={lt("Retry blocked actions", "Повторить заблокированные", "ניסיון חוזר לפעולות חסומות")}
                onPress={() => void retryBlockedNow()}
                disabled={!queueReady || bulkBusy}
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
                  projectName={projectNames[item.project_id] || item.project_id}
                  busy={bulkBusy || busyId === item.client_event_id}
                  timeLabel={timeLabel}
                  retryLabel={lt("Retry now", "Повторить", "ניסיון נוסף")}
                  discardLabel={lt("Discard", "Удалить", "מחיקה")}
                  onRetry={() => void retryItem(item.client_event_id)}
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
        message={lt(
          "Its optimistic local change will also be removed. This cannot be undone.",
          "Связанное локальное изменение тоже будет отменено. Это действие нельзя вернуть.",
          "גם השינוי המקומי יבוטל. לא ניתן לשחזר פעולה זו."
        )}
        confirmLabel={lt("Discard", "Удалить", "מחיקה")}
        cancelLabel={lt("Cancel", "Отмена", "ביטול")}
        danger
        confirmIcon="trash-outline"
        busy={Boolean(dropCandidate && busyId === dropCandidate.client_event_id)}
        onCancel={() => setDropCandidate(null)}
        onConfirm={() => {
          if (!dropCandidate) return;
          const clientEventId = dropCandidate.client_event_id;
          setDropCandidate(null);
          void dropItem(clientEventId);
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
      <Text style={styles.heroStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function QueueCard({
  item,
  locale,
  projectName,
  busy,
  timeLabel,
  retryLabel,
  discardLabel,
  onRetry,
  onDrop,
}: {
  item: PendingSyncEvent;
  locale: "en" | "ru" | "he";
  projectName: string;
  busy: boolean;
  timeLabel: (value: string | null) => string;
  retryLabel: string;
  discardLabel: string;
  onRetry: () => void;
  onDrop: () => void;
}) {
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
    <SectionCard style={styles.queueCard}>
      <View style={[styles.queueStrip, { backgroundColor: colors.text }]} />
      <View style={styles.queueHeader}>
        <View style={[styles.queueIcon, { backgroundColor: colors.background }]}>
          <Ionicons name={icon} size={18} color={colors.text} />
        </View>
        <View style={styles.queueBody}>
          <Text style={styles.queueTitle} numberOfLines={2}>{buildEventSummary(item, locale)}</Text>
          <Text style={styles.queueMeta} numberOfLines={1}>{projectName}</Text>
        </View>
        <StatusPill label={translateEnum(locale, item.status)} tone={tone} />
      </View>
      <View style={[styles.resolution, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.resolutionTitle, { color: colors.text }]}>{resolution.title}</Text>
        <Text style={styles.resolutionDetail}>{resolution.detail}</Text>
        <Text style={styles.resolutionAction}>{resolution.action}</Text>
      </View>
      <View style={styles.queueFacts}>
        <Text style={styles.queueFact}>{timeLabel(item.created_at)}</Text>
        <Text style={styles.queueFact}>{item.attempts}×</Text>
        {item.status === "FAILED" && item.attempts < MAX_AUTO_RETRY_ATTEMPTS && item.next_retry_at
          ? <Text style={styles.queueFact}>{timeLabel(item.next_retry_at)}</Text>
          : null}
      </View>
      <View style={styles.itemActions}>
        <ActionButton
          label={retryLabel}
          icon="refresh"
          variant="dark"
          loading={busy}
          disabled={busy || !resolution.retryAllowed}
          style={styles.flex}
          onPress={onRetry}
        />
        <ActionButton
          label={discardLabel}
          icon="trash-outline"
          variant="danger"
          disabled={busy || !resolution.dropAllowed}
          style={styles.flex}
          onPress={onDrop}
        />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  content: { flex: 1 },
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
  connectionMeta: { color: installerTheme.textFaint, fontSize: 10, lineHeight: 14, marginTop: 3 },
  heroStats: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: installerTheme.radius.card,
    backgroundColor: installerTheme.shellOverlaySubtle,
    marginTop: 10,
  },
  heroStat: { flex: 1, alignItems: "center", paddingHorizontal: 4, paddingVertical: 10 },
  heroStatValue: { fontFamily: installerTheme.fontFamilyMono, fontSize: 17 },
  heroStatLabel: { color: installerTheme.textFaint, fontSize: 8, fontWeight: "700", marginTop: 3 },
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
  bulkActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  queueList: { gap: 8 },
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
  queueTitle: { color: installerTheme.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  queueMeta: { color: installerTheme.textMuted, fontSize: 9, marginTop: 3 },
  resolution: {
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    padding: 10,
    marginTop: 11,
  },
  resolutionTitle: { fontSize: 11, fontWeight: "800" },
  resolutionDetail: { color: installerTheme.textMuted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  resolutionAction: { color: installerTheme.text, fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 6 },
  queueFacts: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 9 },
  queueFact: { color: installerTheme.textFaint, fontFamily: installerTheme.fontFamilyMono, fontSize: 9 },
  itemActions: { flexDirection: "row", gap: 7, marginTop: 11 },
  flex: { flex: 1 },
});
