import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import {
  ActionButton,
  EmptyState,
  IconButton,
  ScreenHero,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { translateEnum } from "@/lib/i18n";
import { installerTheme, toneColors, type InstallerTone } from "@/lib/theme";
import { getProject, listProjects } from "@/modules/projects/repository";
import {
  buildEventSummary,
  buildQueueResolution,
  canRetrySyncEvent,
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
import { useI18n } from "@/providers/AppProviders";

type QueueFilter = "ALL" | "ATTENTION" | "WAITING";

export default function SyncQueueScreen() {
  const { locale } = useI18n();
  const [items, setItems] = useState<PendingSyncEvent[]>([]);
  const [summary, setSummary] = useState<SyncQueueSummary | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";

  const reload = async () => {
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
    const priority = { BLOCKED: 0, FAILED: 1, PENDING: 2 } as const;
    pending.sort((left, right) =>
      priority[left.status] - priority[right.status] || right.created_at.localeCompare(left.created_at)
    );
    setItems(pending);
    setSummary(queueSummary);
    setProjectNames(names);
    setLastSyncAt(syncAt);
  };

  useEffect(() => {
    void reload();
  }, []);

  const attentionCount = (summary?.blocked || 0) + (summary?.failed || 0);
  const retryableBlocked = items.filter((item) => item.status === "BLOCKED" && canRetrySyncEvent(item));
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "ATTENTION") return item.status === "BLOCKED" || item.status === "FAILED";
        if (filter === "WAITING") return item.status === "PENDING";
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

  const confirmDrop = (item: PendingSyncEvent) => {
    Alert.alert(
      lt("Discard queued action?", "Удалить действие из очереди?", "למחוק פעולה מהתור?"),
      lt(
        "Its optimistic local change will also be removed. This cannot be undone.",
        "Связанное локальное изменение тоже будет отменено. Это действие нельзя вернуть.",
        "גם השינוי המקומי יבוטל. לא ניתן לשחזר פעולה זו."
      ),
      [
        { text: lt("Cancel", "Отмена", "ביטול"), style: "cancel" },
        {
          text: lt("Discard", "Удалить", "מחיקה"),
          style: "destructive",
          onPress: () => void dropItem(item.client_event_id),
        },
      ]
    );
  };

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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          eyebrow={lt("OFFLINE QUEUE", "ОФЛАЙН-ОЧЕРЕДЬ", "תור לא מקוון")}
          title={lt("Sync status", "Состояние синхронизации", "מצב סנכרון")}
          subtitle={`${lt("Last sync", "Последняя синхронизация", "סנכרון אחרון")}: ${timeLabel(lastSyncAt)}`}
          right={
            <IconButton
              icon="refresh"
              label={lt("Refresh queue", "Обновить очередь", "רענון התור")}
              tone="dark"
              onPress={() => void reload()}
            />
          }
        >
          <View style={styles.connectionRow}>
            <View style={[styles.connectionIcon, { backgroundColor: attentionCount ? "rgba(255,138,61,0.16)" : "rgba(76,175,80,0.16)" }]}>
              <Ionicons
                name={attentionCount ? "warning-outline" : "cloud-done-outline"}
                size={21}
                color={attentionCount ? installerTheme.warningFill : installerTheme.successFill}
              />
            </View>
            <View style={styles.connectionBody}>
              <Text style={[styles.connectionTitle, { color: attentionCount ? installerTheme.warningFill : "#B8E5C4" }]}>
                {attentionCount
                  ? lt("Queue needs attention", "Очередь требует внимания", "התור דורש טיפול")
                  : summary?.total
                    ? lt("Work is stored safely", "Работы сохранены на телефоне", "העבודה שמורה במכשיר")
                    : lt("Everything is synchronized", "Всё синхронизировано", "הכול מסונכרן")}
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
            <HeroStat label={lt("Queued", "В очереди", "בתור")} value={summary?.pending || 0} tone="accent" />
            <HeroStat label={lt("Failed", "Ошибки", "נכשל")} value={summary?.failed || 0} tone="warning" />
            <HeroStat label={lt("Blocked", "Блоки", "חסום")} value={summary?.blocked || 0} tone="danger" />
            <HeroStat label={lt("Ready", "Готово", "מוכן")} value={summary?.ready_to_send || 0} tone="success" />
          </View>
        </ScreenHero>

        <View style={styles.body}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: lt("All", "Все", "הכול"), count: items.length },
              { value: "ATTENTION", label: lt("Attention", "Внимание", "דורש טיפול"), count: attentionCount },
              { value: "WAITING", label: lt("Waiting", "Ожидают", "ממתין"), count: summary?.pending || 0 },
            ]}
          />

          <View style={styles.bulkActions}>
            <ActionButton
              label={bulkBusy ? lt("Synchronizing…", "Синхронизация…", "מסנכרן…") : lt("Sync now", "Синхронизировать", "סנכרון עכשיו")}
              icon="cloud-upload-outline"
              loading={bulkBusy}
              disabled={bulkBusy || !items.length}
              style={styles.flex}
              onPress={() => void syncNow()}
            />
            {retryableBlocked.length ? (
              <IconButton
                icon="repeat"
                label={lt("Retry blocked actions", "Повторить заблокированные", "ניסיון חוזר לפעולות חסומות")}
                onPress={() => void retryBlockedNow()}
                disabled={bulkBusy}
              />
            ) : null}
          </View>

          {visibleItems.length ? (
            <View style={styles.queueList}>
              <SectionHeader title={lt("Queued actions", "Действия в очереди", "פעולות בתור")} meta={visibleItems.length} />
              {visibleItems.map((item) => (
                <QueueCard
                  key={item.client_event_id}
                  item={item}
                  locale={locale}
                  projectName={projectNames[item.project_id] || item.project_id}
                  busy={busyId === item.client_event_id}
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
                description={lt(
                  "All accepted work has reached the server.",
                  "Все принятые действия уже отправлены на сервер.",
                  "כל הפעולות שהתקבלו הגיעו לשרת."
                )}
              />
            </SectionCard>
          )}
        </View>
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: number; tone: InstallerTone }) {
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
  const tone: InstallerTone = item.status === "BLOCKED" ? "danger" : item.status === "FAILED" ? "warning" : "neutral";
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
        {item.next_retry_at ? <Text style={styles.queueFact}>{timeLabel(item.next_retry_at)}</Text> : null}
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
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  connectionRow: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 16 },
  connectionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  connectionBody: { flex: 1, minWidth: 0 },
  connectionTitle: { fontSize: 13, fontWeight: "800" },
  connectionMeta: { color: installerTheme.textFaint, fontSize: 10, lineHeight: 14, marginTop: 3 },
  heroStats: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: installerTheme.radius.card,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 14,
  },
  heroStat: { flex: 1, alignItems: "center", paddingHorizontal: 4, paddingVertical: 10 },
  heroStatValue: { fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
  heroStatLabel: { color: installerTheme.textFaint, fontSize: 8, fontWeight: "700", marginTop: 3 },
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
  bulkActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  queueList: { gap: 8 },
  queueCard: { position: "relative", overflow: "hidden", paddingLeft: 17 },
  queueStrip: { position: "absolute", top: 0, bottom: 0, left: 0, width: 3 },
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
  queueFact: { color: installerTheme.textFaint, fontSize: 9, fontVariant: ["tabular-nums"] },
  itemActions: { flexDirection: "row", gap: 7, marginTop: 11 },
  flex: { flex: 1 },
});
