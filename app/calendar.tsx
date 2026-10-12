import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import { useReducedMotion } from "@/components/motion";
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
import { translateEnum } from "@/lib/i18n";
import { installerTheme, toneColors } from "@/lib/theme";
import { loadInstallerCalendar } from "@/modules/calendar/service";
import { calendarDayParam, calendarEventAppearance, calendarEventDay, compareCalendarEvents } from "@/modules/calendar/presentation";
import type { InstallerCalendarEvent, InstallerCalendarViewModel } from "@/modules/calendar/types";
import { openProjectExternalAction } from "@/modules/projects/external-actions";
import {
  buildDoorPrepRoute,
  buildIssueRouteFromCalendarEvent,
  buildProjectRouteFromCalendarEvent,
} from "@/modules/projects/navigation";
import { useAuth, useI18n } from "@/providers/AppProviders";

const ALL_DAYS = "ALL";
const EMPTY_CALENDAR: InstallerCalendarViewModel = { snapshot: null, source: "unavailable", message: null };

export default function CalendarScreen() {
  const { locale } = useI18n();
  const { syncVersion, user } = useAuth();
  const identity = `${user?.company_id || ""}:${user?.id || ""}`;
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ day?: string }>();
  const anchorDay = calendarDayParam(params.day);
  const [loaded, setLoaded] = useState<{ identity: string; value: InstallerCalendarViewModel } | null>(null);
  const state = loaded?.identity === identity ? loaded.value : EMPTY_CALENDAR;
  const [selectedDay, setSelectedDay] = useState(anchorDay || ALL_DAYS);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<{ eventId: string; message: string } | null>(null);
  const [openingWaze, setOpeningWaze] = useState(false);
  const openingWazeRef = useRef(false);
  const loadRevision = useRef(0);
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";

  const reload = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoading(true);
    try {
      const value = await loadInstallerCalendar("7d", anchorDay);
      if (revision === loadRevision.current) setLoaded({ identity, value });
    } catch (reason) {
      if (revision === loadRevision.current) setLoaded({ identity, value: {
        snapshot: null,
        source: "unavailable",
        message: reason instanceof Error ? reason.message : "Calendar loading failed.",
      } });
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }, [anchorDay, identity]);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { loadRevision.current += 1; };
  }, [reload, syncVersion]));

  const items = state.snapshot?.items || [];
  const dayOptions = useMemo(
    () => Array.from(new Set([...items.map(calendarEventDay), ...(selectedDay === ALL_DAYS ? [] : [selectedDay])])).sort(),
    [items, selectedDay]
  );
  const visibleItems = useMemo(
    () =>
      (selectedDay === ALL_DAYS ? items : items.filter((item) => calendarEventDay(item) === selectedDay))
        .slice()
        .sort(compareCalendarEvents),
    [items, selectedDay]
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, InstallerCalendarEvent[]>();
    for (const item of visibleItems) {
      const key = calendarEventDay(item);
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return Array.from(groups.entries());
  }, [visibleItems]);
  const selectedEvent = useMemo(
    () => items.find((item) => item.id === selectedEventId) || null,
    [items, selectedEventId]
  );
  const inspectionCount = visibleItems.filter((item) => ["inspection", "service"].includes(item.event_type.trim().toLowerCase())).length;
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
    setSelectedDay(anchorDay || ALL_DAYS);
  }, [anchorDay]);

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
  const eventTime = (item: InstallerCalendarEvent) => {
    const endDay = calendarEventDay({ starts_at: item.ends_at });
    const range = `${timeLabel(item.starts_at)} – ${timeLabel(item.ends_at)}`;
    const directedRange = locale === "he" ? `\u2066${range}\u2069` : range;
    return `${directedRange}${endDay !== calendarEventDay(item) ? ` (${dayLabel(endDay, true)})` : ""}`;
  };
  const eventLabel = (item: InstallerCalendarEvent) => {
    const { label } = calendarEventAppearance(item.event_type);
    return label === "other" ? lt("Visit", "Выезд", "ביקור") : translateEnum(locale, label);
  };
  const closeDetails = () => { setSelectedEventId(null); setActionError(null); };
  const navigate = (route: string | null) => {
    if (!route) return;
    closeDetails();
    router.push(route as never);
  };

  const openWaze = async (item: InstallerCalendarEvent) => {
    if (!item.waze_url || openingWazeRef.current) return;
    openingWazeRef.current = true;
    setOpeningWaze(true);
    setActionError(null);
    try {
      await openProjectExternalAction({ kind: "waze", url: item.waze_url });
    } catch (reason) {
      setActionError({ eventId: item.id, message: reason instanceof Error ? reason.message : lt("Unable to open Waze", "Не удалось открыть Waze", "לא ניתן לפתוח את Waze") });
    } finally {
      openingWazeRef.current = false;
      setOpeningWaze(false);
    }
  };

  const renderEventActions = (item: InstallerCalendarEvent) => {
    const inspection = ["inspection", "service"].includes(item.event_type.trim().toLowerCase());
    return (
      <View>
        <View style={styles.actions}>
          {item.project_id ? (
            <ActionButton
              label={lt("Open job", "Открыть объект", "פתיחת עבודה")}
              icon="briefcase-outline"
              variant="dark"
              style={styles.flex}
              onPress={() => navigate(buildProjectRouteFromCalendarEvent(item))}
            />
          ) : null}
          {item.project_id ? (
            <IconButton
              icon={inspection ? "alert-circle-outline" : "grid-outline"}
              label={inspection ? lt("Open issues", "Открыть проблемы", "פתיחת תקלות") : lt("Open doors", "Открыть двери", "פתיחת דלתות")}
              onPress={() => navigate(inspection
                ? buildIssueRouteFromCalendarEvent(item)
                : buildDoorPrepRoute(item.project_id as string))}
            />
          ) : null}
          {item.waze_url ? (
            <IconButton
              icon="navigate-outline"
              label={lt("Open Waze", "Открыть Waze", "פתיחת Waze")}
              tone="accent"
              disabled={openingWaze}
              onPress={() => void openWaze(item)}
            />
          ) : null}
        </View>
        {actionError?.eventId === item.id ? <Text style={styles.errorText} accessibilityLiveRegion="assertive">{actionError.message}</Text> : null}
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
                loading
                  ? lt("Loading plan", "Загрузка плана", "טעינת התכנית")
                  : state.source === "online"
                  ? lt("Live data", "Актуальные данные", "נתונים עדכניים")
                  : state.source === "cache"
                    ? lt("Offline copy", "Офлайн-копия", "עותק לא מקוון")
                    : lt("Unavailable", "Недоступно", "לא זמין")
              }
              tone={loading ? "neutral" : state.source === "online" ? "success" : state.source === "cache" ? "warning" : "danger"}
              icon={loading ? "hourglass-outline" : state.source === "online" ? "cloud-done-outline" : "cloud-offline-outline"}
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
            <MetricTile label={lt("Visits", "Выезды", "ביקורים")} value={state.snapshot ? visibleItems.length : "—"} meta={lt("in current view", "в выбранном периоде", "בתצוגה")} tone="accent" />
            <MetricTile label={lt("Projects", "Объекты", "פרויקטים")} value={state.snapshot ? projectCount : "—"} meta={lt("linked to work", "с назначенными работами", "עם עבודות")} tone="info" />
            <MetricTile label={lt("Checks", "Проверки", "בדיקות")} value={state.snapshot ? inspectionCount : "—"} meta={lt("inspection and service", "проверки и сервис", "בדיקות ושירות")} tone={inspectionCount ? "warning" : "success"} />
          </View>

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
                  const appearance = calendarEventAppearance(item.event_type);
                  const colors = toneColors(appearance.tone);
                  return (
                    <SectionCard key={item.id} style={styles.eventCard}>
                      <View style={[styles.eventStrip, { backgroundColor: colors.text }]} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${item.title}. ${dayLabel(day)}. ${eventTime(item)}`}
                        accessibilityState={{ selected: selectedEventId === item.id }}
                        onPress={() => { setActionError(null); setSelectedEventId(item.id); }}
                        style={({ pressed }) => [styles.eventTop, pressed && styles.eventTopPressed]}
                      >
                        <View style={[styles.eventIcon, { backgroundColor: colors.background }]}>
                          <Ionicons
                            name={appearance.icon}
                            size={18}
                            color={colors.text}
                          />
                        </View>
                        <View style={styles.eventBody}>
                          <Text style={styles.eventTitle} numberOfLines={2}>{item.title}</Text>
                          <Text style={styles.eventTime}>{eventTime(item)}</Text>
                          <View style={styles.eventType}><StatusPill label={eventLabel(item)} tone={appearance.tone} /></View>
                        </View>
                        <Ionicons name={locale === "he" ? "chevron-back" : "chevron-forward"} size={16} color={installerTheme.textFaint} />
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
          )) : loading ? (
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={installerTheme.info} />
              <Text style={styles.metaText}>{lt("Loading plan", "Загрузка плана", "טעינת התכנית")}</Text>
            </View>
          ) : !state.snapshot ? (
            <SectionCard>
              <EmptyState icon="cloud-offline-outline" title={lt("Plan unavailable", "План недоступен", "התכנית אינה זמינה")} description={lt("Connect to refresh your assigned visits.", "Подключитесь к сети, чтобы обновить назначенные выезды.", "התחברו לרשת כדי לעדכן ביקורים שהוקצו.")} action={<ActionButton label={lt("Retry", "Повторить", "ניסיון נוסף")} icon="refresh" onPress={() => void reload()} />} />
            </SectionCard>
          ) : (
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
      {selectedEvent ? (
        <Modal visible transparent statusBarTranslucent animationType={reducedMotion ? "none" : "fade"} onRequestClose={closeDetails}>
          <SafeAreaView style={[styles.modalRoot, { direction: locale === "he" ? "rtl" : "ltr" }]} edges={["top", "bottom", "left", "right"]}>
            <Pressable feedback="none" accessibilityRole="button" accessibilityLabel={lt("Dismiss visit details", "Закрыть окно выезда", "סגירת חלון הביקור")} style={styles.modalBackdrop} onPress={closeDetails} />
            <View accessibilityViewIsModal onAccessibilityEscape={closeDetails} testID="calendar-visit-details" style={[styles.modalPanel, { borderColor: toneColors(calendarEventAppearance(selectedEvent.event_type).tone).border }]}>
              <View style={styles.selectedEventHeader}>
                <View style={styles.selectedEventBody}>
                  <StatusPill label={eventLabel(selectedEvent)} tone={calendarEventAppearance(selectedEvent.event_type).tone} />
                  <Text style={styles.selectedEventTitle}>{selectedEvent.title}</Text>
                </View>
                <IconButton icon="close" label={lt("Close visit details", "Закрыть детали выезда", "סגירת פרטי הביקור")} onPress={closeDetails} />
              </View>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBody}>
                <Text style={styles.selectedEventTime}>{dayLabel(calendarEventDay(selectedEvent))} · {eventTime(selectedEvent)}</Text>
                {state.source === "cache" ? <Text style={styles.noticeText}>{lt("Offline copy", "Офлайн-копия", "עותק לא מקוון")}</Text> : null}
                {selectedEvent.location ? (
                  <View style={styles.metaRow}><Ionicons name="location-outline" size={15} color={installerTheme.textMuted} /><Text style={styles.metaText}>{selectedEvent.location}</Text></View>
                ) : null}
                {selectedEvent.description ? <Text style={styles.selectedEventDescription}>{selectedEvent.description}</Text> : null}
                {renderEventActions(selectedEvent)}
              </ScrollView>
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
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
  noticeText: { flex: 1, color: installerTheme.info, fontSize: installerTheme.type.caption, lineHeight: 16 },
  errorText: { color: installerTheme.danger, fontSize: 12, lineHeight: 18, marginTop: 8 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
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
  dayChipText: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, fontWeight: "800" },
  dayChipTextActive: { color: installerTheme.info },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modalRoot: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
  modalPanel: { width: "100%", maxWidth: 480, maxHeight: "90%", flexShrink: 1, borderWidth: 1, borderTopWidth: 3, borderRadius: installerTheme.radius.card, backgroundColor: installerTheme.shellRaised, overflow: "hidden" },
  modalScroll: { flexShrink: 1 },
  modalBody: { paddingHorizontal: 16, paddingBottom: 18, gap: 8 },
  selectedEventHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: installerTheme.border },
  selectedEventBody: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 8 },
  selectedEventTitle: { color: installerTheme.text, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  selectedEventTime: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: installerTheme.type.caption,
    lineHeight: 15,
    marginTop: 10,
  },
  selectedEventDescription: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 17, marginTop: 9 },
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
  eventTime: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption, marginTop: 3 },
  eventType: { alignSelf: "flex-start", marginTop: 7 },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 11 },
  metaText: { flex: 1, color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16 },
  description: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16, marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: 12 },
  flex: { flexGrow: 1, flexBasis: 150 },
});
