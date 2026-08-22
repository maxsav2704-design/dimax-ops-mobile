import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, View } from "react-native";
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
  StatusPill,
} from "@/components/mobile-ui";
import { installerTheme } from "@/lib/theme";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import type { InstallerCalendarEvent, InstallerCalendarViewModel } from "@/modules/calendar/types";
import { openProjectExternalAction } from "@/modules/projects/external-actions";
import {
  buildDoorPrepRoute,
  buildIssueRouteFromCalendarEvent,
  buildProjectRouteFromCalendarEvent,
} from "@/modules/projects/navigation";
import { useI18n } from "@/providers/AppProviders";

const ALL_DAYS = "ALL";

export default function CalendarScreen() {
  const { locale } = useI18n();
  const params = useLocalSearchParams<{ day?: string }>();
  const [state, setState] = useState<InstallerCalendarViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [selectedDay, setSelectedDay] = useState(ALL_DAYS);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";

  const reload = async () => {
    setLoading(true);
    try {
      setState(await loadInstallerCalendar("7d"));
    } catch (reason) {
      setState({
        snapshot: null,
        source: "unavailable",
        message: reason instanceof Error ? reason.message : "Calendar loading failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const items = state.snapshot?.items || [];
  const dayOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.starts_at.slice(0, 10)))).sort(),
    [items]
  );
  const visibleItems = useMemo(
    () =>
      (selectedDay === ALL_DAYS ? items : items.filter((item) => item.starts_at.slice(0, 10) === selectedDay))
        .slice()
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at)),
    [items, selectedDay]
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, InstallerCalendarEvent[]>();
    for (const item of visibleItems) {
      const key = item.starts_at.slice(0, 10);
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return Array.from(groups.entries());
  }, [visibleItems]);
  const selectedEvent = useMemo(
    () => items.find((item) => item.id === selectedEventId) || null,
    [items, selectedEventId]
  );
  const serviceCount = visibleItems.filter((item) => item.event_type.toUpperCase() === "SERVICE").length;
  const projectCount = new Set(visibleItems.map((item) => item.project_id).filter(Boolean)).size;
  const stateNotice = !state.message
    ? null
    : state.source === "online"
      ? lt(
          "The plan is current, but its offline copy could not be updated.",
          "План актуален, но его офлайн-копию не удалось обновить.",
          "התכנית עדכנית, אך לא ניתן לעדכן את העותק הלא מקוון."
        )
      : state.source === "cache"
      ? lt(
          "The plan could not be refreshed. The latest saved copy is shown.",
          "Не удалось обновить план. Показана последняя сохранённая копия.",
          "לא ניתן לרענן את התכנית. מוצג העותק האחרון שנשמר."
        )
      : lt(
          "The work plan is temporarily unavailable. Try refreshing it.",
          "План работ временно недоступен. Попробуйте обновить его.",
          "תכנית העבודה אינה זמינה כעת. נסו לרענן אותה."
        );

  useEffect(() => {
    const incomingDay = typeof params.day === "string" ? params.day.trim() : "";
    if (incomingDay) setSelectedDay(incomingDay);
  }, [params.day]);

  useEffect(() => {
    if (selectedDay !== ALL_DAYS && !dayOptions.includes(selectedDay)) setSelectedDay(ALL_DAYS);
  }, [dayOptions, selectedDay]);

  useEffect(() => {
    if (selectedEventId && !visibleItems.some((item) => item.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [selectedEventId, visibleItems]);

  const dayLabel = (day: string, compact = false) => {
    const date = new Date(`${day}T12:00:00`);
    return new Intl.DateTimeFormat(intlLocale, compact
      ? { weekday: "short", day: "numeric" }
      : { weekday: "long", day: "numeric", month: "long" }).format(date);
  };
  const timeLabel = (value: string) =>
    new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

  const openWaze = async (url: string | null) => {
    if (!url) return;
    setActionError(null);
    try {
      await openProjectExternalAction({ kind: "waze", url });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : lt("Unable to open Waze", "Не удалось открыть Waze", "לא ניתן לפתוח את Waze"));
    }
  };

  const renderEventActions = (item: InstallerCalendarEvent) => {
    const service = item.event_type.toUpperCase() === "SERVICE";
    return (
      <View style={styles.actions}>
        {item.project_id ? (
          <ActionButton
            label={lt("Open job", "Открыть объект", "פתיחת עבודה")}
            icon="briefcase-outline"
            variant="dark"
            style={styles.flex}
            onPress={() => {
              const route = buildProjectRouteFromCalendarEvent(item);
              if (route) router.push(route as never);
            }}
          />
        ) : null}
        {item.project_id ? (
          <IconButton
            icon={service ? "alert-circle-outline" : "grid-outline"}
            label={service ? lt("Open issues", "Открыть проблемы", "פתיחת תקלות") : lt("Prepare doors", "Открыть двери", "פתיחת דלתות")}
            onPress={() => {
              const route = service
                ? buildIssueRouteFromCalendarEvent(item)
                : buildDoorPrepRoute(item.project_id as string);
              if (route) router.push(route as never);
            }}
          />
        ) : null}
        {item.waze_url ? (
          <IconButton
            icon="navigate-outline"
            label={lt("Open Waze", "Открыть Waze", "פתיחת Waze")}
            tone="accent"
            onPress={() => void openWaze(item.waze_url)}
          />
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          showMark={false}
          eyebrow={lt("7-DAY FIELD PLAN", "ПЛАН НА 7 ДНЕЙ", "תכנית עבודה ל-7 ימים")}
          title={lt("Work plan", "План работ", "תכנית עבודה")}
          subtitle={lt(
            "Assigned installation and service visits",
            "Назначенные монтажи и сервисные выезды",
            "התקנות וביקורי שירות שהוקצו"
          )}
          right={
            <IconButton
              icon="refresh"
              label={lt("Refresh plan", "Обновить план", "רענון התכנית")}
              tone="dark"
              disabled={loading}
              onPress={() => void reload()}
            />
          }
        >
          <View style={styles.heroState}>
            <StatusPill
              label={
                state.source === "online"
                  ? lt("Live data", "Актуальные данные", "נתונים עדכניים")
                  : state.source === "cache"
                    ? lt("Offline cache", "Офлайн-копия", "עותק לא מקוון")
                    : lt("Unavailable", "Недоступно", "לא זמין")
              }
              tone={state.source === "online" ? "success" : state.source === "cache" ? "warning" : "danger"}
              icon={state.source === "online" ? "cloud-done-outline" : "cloud-offline-outline"}
            />
          </View>
        </ScreenHero>

        <View style={styles.body}>
          {stateNotice ? (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Ionicons name="information-circle-outline" size={18} color={installerTheme.info} />
              <Text style={styles.noticeText}>{stateNotice}</Text>
            </View>
          ) : null}
          {actionError ? <Text style={styles.errorText} accessibilityLiveRegion="assertive">{actionError}</Text> : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
            <Pressable
              onPress={() => setSelectedDay(ALL_DAYS)}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedDay === ALL_DAYS }}
              accessibilityLabel={lt("Show all week", "Показать всю неделю", "הצגת כל השבוע")}
              style={[styles.dayChip, selectedDay === ALL_DAYS && styles.dayChipActive]}
            >
              <Text style={[styles.dayChipText, selectedDay === ALL_DAYS && styles.dayChipTextActive]}>
                {lt("All week", "Вся неделя", "כל השבוע")}
              </Text>
            </Pressable>
            {dayOptions.map((day) => (
              <Pressable
                key={day}
                onPress={() => setSelectedDay(day)}
                accessibilityRole="tab"
                accessibilityState={{ selected: selectedDay === day }}
                accessibilityLabel={dayLabel(day)}
                style={[styles.dayChip, selectedDay === day && styles.dayChipActive]}
              >
                <Text style={[styles.dayChipText, selectedDay === day && styles.dayChipTextActive]}>
                  {dayLabel(day, true)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.metrics}>
            <MetricTile label={lt("Visits", "Выезды", "ביקורים")} value={visibleItems.length} meta={lt("in current view", "в выбранном периоде", "בתצוגה")} tone="accent" />
            <MetricTile label={lt("Projects", "Объекты", "פרויקטים")} value={projectCount} meta={lt("linked to work", "с назначенными работами", "עם עבודות")} tone="info" />
            <MetricTile label={lt("Service", "Сервис", "שירות")} value={serviceCount} meta={lt("attention visits", "сервисных выездов", "ביקורי שירות")} tone={serviceCount ? "warning" : "success"} />
          </View>

          {selectedEvent ? (
            <SectionCard
              style={[
                styles.selectedEvent,
                {
                  borderColor: selectedEvent.event_type.toUpperCase() === "SERVICE"
                    ? installerTheme.warningBorder
                    : installerTheme.infoBorder,
                },
              ]}
            >
              <View style={styles.selectedEventHeader}>
                <View style={styles.selectedEventBody}>
                  <StatusPill
                    label={selectedEvent.event_type.toUpperCase() === "SERVICE"
                      ? lt("Service", "Сервис", "שירות")
                      : lt("Install", "Монтаж", "התקנה")}
                    tone={selectedEvent.event_type.toUpperCase() === "SERVICE" ? "warning" : "info"}
                  />
                  <Text style={styles.selectedEventTitle}>{selectedEvent.title}</Text>
                </View>
                <IconButton
                  icon="close"
                  label={lt("Close visit details", "Закрыть детали выезда", "סגירת פרטי הביקור")}
                  onPress={() => setSelectedEventId(null)}
                />
              </View>
              <Text style={styles.selectedEventTime}>
                {dayLabel(selectedEvent.starts_at.slice(0, 10))} · {timeLabel(selectedEvent.starts_at)}–{timeLabel(selectedEvent.ends_at)}
              </Text>
              {selectedEvent.location ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={15} color={installerTheme.textMuted} />
                  <Text style={styles.metaText}>{selectedEvent.location}</Text>
                </View>
              ) : null}
              {selectedEvent.description ? <Text style={styles.selectedEventDescription}>{selectedEvent.description}</Text> : null}
              {renderEventActions(selectedEvent)}
            </SectionCard>
          ) : null}

          {selectedDay !== ALL_DAYS ? (
            <ActionButton
              label={lt("Open earnings for this day", "Открыть заработок за день", "פתיחת שכר ליום זה")}
              icon="cash-outline"
              variant="secondary"
              onPress={() => router.push(`/earnings?focus=DAY&day=${encodeURIComponent(selectedDay)}` as never)}
            />
          ) : null}

          {groupedItems.length ? groupedItems.map(([day, dayItems]) => (
            <View key={day} style={styles.dayGroup}>
              <SectionHeader title={dayLabel(day)} meta={dayItems.length} />
              <View style={styles.events}>
                {dayItems.map((item) => {
                  const service = item.event_type.toUpperCase() === "SERVICE";
                  return (
                    <SectionCard key={item.id} style={styles.eventCard}>
                      <View style={[styles.eventStrip, { backgroundColor: service ? installerTheme.warningFill : installerTheme.infoFill }]} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${item.title}. ${dayLabel(day)}. ${timeLabel(item.starts_at)}–${timeLabel(item.ends_at)}`}
                        accessibilityState={{ selected: selectedEventId === item.id }}
                        onPress={() => setSelectedEventId(item.id)}
                        style={({ pressed }) => [styles.eventTop, pressed && styles.eventTopPressed]}
                      >
                        <View style={[styles.eventIcon, { backgroundColor: service ? installerTheme.warningSoft : installerTheme.infoSoft }]}>
                          <Ionicons
                            name={service ? "construct-outline" : "briefcase-outline"}
                            size={18}
                            color={service ? installerTheme.warning : installerTheme.info}
                          />
                        </View>
                        <View style={styles.eventBody}>
                          <Text style={styles.eventTitle} numberOfLines={2}>{item.title}</Text>
                          <Text style={styles.eventTime}>{timeLabel(item.starts_at)} – {timeLabel(item.ends_at)}</Text>
                        </View>
                        <StatusPill
                          label={service ? lt("Service", "Сервис", "שירות") : lt("Install", "Монтаж", "התקנה")}
                          tone={service ? "warning" : "info"}
                        />
                        <Ionicons name="chevron-forward" size={16} color={installerTheme.textFaint} />
                      </Pressable>
                      {item.location ? (
                        <View style={styles.metaRow}>
                          <Ionicons name="location-outline" size={15} color={installerTheme.textMuted} />
                          <Text style={styles.metaText} numberOfLines={2}>{item.location}</Text>
                        </View>
                      ) : null}
                      {item.description ? <Text style={styles.description} numberOfLines={3}>{item.description}</Text> : null}
                      {renderEventActions(item)}
                    </SectionCard>
                  );
                })}
              </View>
            </View>
          )) : (
            <SectionCard>
              <EmptyState
                icon="calendar-outline"
                title={lt("No assigned visits", "Нет назначенных выездов", "אין ביקורים שהוקצו")}
                description={lt(
                  "The office has not scheduled work for this period.",
                  "Офис ещё не назначил работы на выбранный период.",
                  "המשרד עדיין לא תזמן עבודה לתקופה זו."
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  content: { flex: 1 },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  heroState: { alignSelf: "flex-start", marginTop: 10 },
  body: { gap: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.infoBorder,
    backgroundColor: installerTheme.infoSoft,
    padding: 11,
  },
  noticeText: { flex: 1, color: installerTheme.info, fontSize: 11, lineHeight: 16 },
  errorText: { color: installerTheme.danger, fontSize: 11 },
  dayStrip: { gap: 7, paddingEnd: 12 },
  dayChip: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 13,
  },
  dayChipActive: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.primarySoft },
  dayChipText: { color: installerTheme.textMuted, fontSize: 10, fontWeight: "800" },
  dayChipTextActive: { color: installerTheme.info },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selectedEvent: { borderWidth: 1, borderStartWidth: 3 },
  selectedEventHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  selectedEventBody: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 8 },
  selectedEventTitle: { color: installerTheme.text, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  selectedEventTime: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 10,
  },
  selectedEventDescription: { color: installerTheme.textMuted, fontSize: 11, lineHeight: 17, marginTop: 9 },
  dayGroup: { gap: 7 },
  events: { gap: 8 },
  eventCard: { position: "relative", overflow: "hidden", paddingStart: 17, borderColor: installerTheme.borderStrong },
  eventStrip: { position: "absolute", top: 0, bottom: 0, start: 0, width: 3 },
  eventTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  eventTopPressed: { opacity: 0.68 },
  eventIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.md,
  },
  eventBody: { flex: 1, minWidth: 0 },
  eventTitle: { color: installerTheme.text, fontSize: 13, lineHeight: 17, fontWeight: "800" },
  eventTime: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: 10, marginTop: 3 },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 11 },
  metaText: { flex: 1, color: installerTheme.textMuted, fontSize: 11, lineHeight: 16 },
  description: { color: installerTheme.textMuted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 },
  flex: { flex: 1 },
});
