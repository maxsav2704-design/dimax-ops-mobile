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
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { currentLocalDateKey } from "@/lib/date-key";
import { installerTheme } from "@/lib/theme";
import {
  buildScopedEarningsFocusContext,
  type EarningsPeriodFocus,
} from "@/modules/earnings/presentation";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsRow, InstallerEarningsViewModel } from "@/modules/earnings/types";
import { buildIssueProjectRoute, buildProjectRoute } from "@/modules/projects/navigation";
import { useAuth, useI18n } from "@/providers/AppProviders";

type EarningsTab = "BREAKDOWN" | "PROJECTS" | "ROWS";

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]?.trim() || "" : typeof value === "string" ? value.trim() : "";
}

function queryFocus(value: string | string[] | undefined): EarningsPeriodFocus | null {
  const normalized = queryValue(value).toUpperCase();
  return normalized === "TODAY" || normalized === "MONTH" || normalized === "DAY" ? normalized : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function EarningsScreen() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const params = useLocalSearchParams<{ focus?: string; day?: string; project_id?: string }>();
  const [state, setState] = useState<InstallerEarningsViewModel>({
    snapshot: null,
    source: "unavailable",
    message: null,
  });
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<EarningsPeriodFocus>(queryFocus(params.focus) || "MONTH");
  const [selectedDay, setSelectedDay] = useState<string | null>(queryValue(params.day) || null);
  const [installType, setInstallType] = useState("ALL");
  const [tab, setTab] = useState<EarningsTab>("BREAKDOWN");
  const [openProjectKey, setOpenProjectKey] = useState<string | null>(null);
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";

  const reload = async () => {
    setLoading(true);
    try {
      setState(await loadInstallerEarnings("month", focus === "DAY" ? selectedDay : null));
    } catch (reason) {
      setState({
        snapshot: null,
        source: "unavailable",
        message: reason instanceof Error ? reason.message : "Earnings loading failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [focus === "DAY" ? selectedDay : null]);

  useEffect(() => {
    const incomingFocus = queryFocus(params.focus);
    const incomingDay = queryValue(params.day);
    if (incomingFocus) setFocus(incomingFocus);
    if (incomingDay) setSelectedDay(incomingDay);
  }, [params.day, params.focus]);

  const snapshot = state.snapshot;
  const today = currentLocalDateKey();
  const focusedProjectId = queryValue(params.project_id);
  const context = useMemo(
    () => buildScopedEarningsFocusContext(snapshot, today, focus, selectedDay, focusedProjectId),
    [focus, focusedProjectId, selectedDay, snapshot, today]
  );
  const currency = context?.currency || snapshot?.currency || "ILS";
  const focusRows = context?.rows || [];
  const projectScopeMissing = Boolean(context?.projectMissing);
  const projectScopeActive = Boolean(context?.projectId && !context.projectMissing);
  const installTypes = context?.installTypeSummary || [];
  const rows = useMemo(
    () => installType === "ALL" ? focusRows : focusRows.filter((row) => row.install_type_code === installType),
    [focusRows, installType]
  );
  const days = useMemo(
    () => Array.from(new Set((snapshot?.days || []).map((day) => day.date))).sort(),
    [snapshot?.days]
  );
  const dayLanes = useMemo(() => {
    const lanes = new Map<string, { date: string; amount: number; quantity: number; rows: number }>();
    for (const row of rows) {
      const current = lanes.get(row.work_date) || { date: row.work_date, amount: 0, quantity: 0, rows: 0 };
      current.amount += numberValue(row.amount);
      current.quantity += numberValue(row.quantity);
      current.rows += 1;
      lanes.set(row.work_date, current);
    }
    return Array.from(lanes.values()).sort((left, right) => right.date.localeCompare(left.date));
  }, [rows]);
  const projectLanes = useMemo(() => {
    const lanes = new Map<string, {
      key: string;
      projectId: string | null;
      projectName: string;
      amount: number;
      quantity: number;
      rows: InstallerEarningsRow[];
    }>();
    for (const row of rows) {
      const key = row.project_id || `unlinked:${row.id}`;
      const current = lanes.get(key) || {
        key,
        projectId: row.project_id,
        projectName: row.project_name || lt("No project", "Без объекта", "ללא פרויקט"),
        amount: 0,
        quantity: 0,
        rows: [],
      };
      current.amount += numberValue(row.amount);
      current.quantity += numberValue(row.quantity);
      current.rows.push(row);
      lanes.set(key, current);
    }
    return Array.from(lanes.values()).sort((left, right) => right.amount - left.amount);
  }, [rows]);
  const totalAmount = rows.reduce((sum, row) => sum + numberValue(row.amount), 0);
  const totalQuantity = rows.reduce((sum, row) => sum + numberValue(row.quantity), 0);
  const projectCount = new Set(rows.map((row) => row.project_id).filter(Boolean)).size;
  const stateNotice = !state.message
    ? null
    : state.source === "online"
      ? lt(
          "Earnings are current, but their offline copy could not be updated.",
          "Начисления актуальны, но их офлайн-копию не удалось обновить.",
          "נתוני השכר עדכניים, אך לא ניתן לעדכן את העותק הלא מקוון."
        )
      : state.source === "cache"
      ? lt(
          "Earnings could not be refreshed. The latest saved calculation is shown.",
          "Не удалось обновить начисления. Показан последний сохранённый расчёт.",
          "לא ניתן לרענן את השכר. מוצג החישוב האחרון שנשמר."
        )
      : lt(
          "Earnings are temporarily unavailable. Try refreshing them.",
          "Начисления временно недоступны. Попробуйте обновить их.",
          "נתוני השכר אינם זמינים כעת. נסו לרענן אותם."
        );

  useEffect(() => {
    if (!selectedDay && days.length) setSelectedDay(days[days.length - 1]);
  }, [days, selectedDay]);

  useEffect(() => {
    if (installType !== "ALL" && !installTypes.some((item) => item.code === installType)) {
      setInstallType("ALL");
    }
  }, [installType, installTypes]);

  useEffect(() => {
    if (!projectLanes.some((lane) => lane.key === openProjectKey)) {
      setOpenProjectKey(projectLanes[0]?.key || null);
    }
  }, [openProjectKey, projectLanes]);

  const money = (amount: number | string) => {
    const value = typeof amount === "string" ? numberValue(amount) : amount;
    try {
      return new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency}`;
    }
  };
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "short", weekday: "short" })
      .format(new Date(`${date}T12:00:00`));
  const periodLabel =
    focus === "TODAY"
      ? lt("Today", "Сегодня", "היום")
      : focus === "DAY" && selectedDay
        ? dateLabel(selectedDay)
        : lt("This month", "Этот месяц", "החודש");

  const moveDay = (offset: number) => {
    if (!days.length) return;
    const currentIndex = selectedDay ? days.indexOf(selectedDay) : days.length - 1;
    const nextIndex = Math.max(0, Math.min(days.length - 1, currentIndex + offset));
    setFocus("DAY");
    setSelectedDay(days[nextIndex]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          showMark={false}
          eyebrow={lt("EARNINGS", "ЗАРАБОТОК", "שכר")}
          title={user?.full_name || "DIMAX Installer"}
          subtitle={lt("Calculated by completed work on the server", "Рассчитано по выполненным работам на сервере", "מחושב לפי עבודות שהושלמו בשרת")}
          right={
            <IconButton
              icon="refresh"
              label={lt("Refresh earnings", "Обновить заработок", "רענון שכר")}
              tone="dark"
              disabled={loading}
              onPress={() => void reload()}
            />
          }
        >
          <View style={styles.periodNav}>
            <IconButton icon="chevron-back" label={lt("Previous day", "Предыдущий день", "יום קודם")} tone="dark" disabled={!days.length} onPress={() => moveDay(-1)} />
            <View style={styles.periodBody}>
              <Text style={styles.periodTitle}>{periodLabel}</Text>
              <Text style={styles.periodMeta}>{rows.length} {lt("work rows", "строк работ", "שורות עבודה")}</Text>
            </View>
            <IconButton icon="chevron-forward" label={lt("Next day", "Следующий день", "יום הבא")} tone="dark" disabled={!days.length} onPress={() => moveDay(1)} />
          </View>
          <Text style={styles.totalLabel}>{lt("EARNINGS IN VIEW", "ЗАРАБОТОК В ВЫБРАННОМ ПЕРИОДЕ", "שכר בתקופה")}</Text>
          <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{money(totalAmount)}</Text>
          <View style={styles.heroStatus}>
            <StatusPill
              label={
                state.source === "online"
                  ? lt("Live data", "Актуальные данные", "נתונים עדכניים")
                  : state.source === "cache"
                    ? lt("Offline cache", "Офлайн-копия", "עותק לא מקוון")
                    : lt("Unavailable", "Недоступно", "לא זמין")
              }
              tone={state.source === "online" ? "success" : state.source === "cache" ? "warning" : "danger"}
            />
          </View>
          <SegmentedControl
            value={tab}
            onChange={setTab}
            dark
            options={[
              { value: "BREAKDOWN", label: lt("Types", "Типы", "סוגים"), count: installTypes.length },
              { value: "PROJECTS", label: lt("Projects", "Объекты", "פרויקטים"), count: projectLanes.length },
              { value: "ROWS", label: lt("Details", "Детали", "פירוט"), count: rows.length },
            ]}
          />
        </ScreenHero>

        <View style={styles.body}>
          {stateNotice ? (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Ionicons name="information-circle-outline" size={18} color={installerTheme.warning} />
              <Text style={styles.noticeText}>{stateNotice}</Text>
            </View>
          ) : null}
          {projectScopeMissing ? (
            <View style={styles.notice}>
              <Ionicons name="alert-circle-outline" size={18} color={installerTheme.warning} />
              <View style={styles.noticeBody}>
                <Text style={styles.noticeText}>
                  {lt(
                    `Project ${focusedProjectId} is not available in your earnings. Another project was not opened automatically.`,
                    `Объект ${focusedProjectId} недоступен в ваших начислениях. Другой объект не был открыт автоматически.`,
                    `הפרויקט ${focusedProjectId} אינו זמין בשכר שלך. פרויקט אחר לא נפתח אוטומטית.`
                  )}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={lt("Show all earnings", "Показать все начисления", "הצג את כל השכר")}
                  onPress={() => router.replace("/earnings" as never)}
                  style={({ pressed }) => [styles.noticeAction, pressed && styles.pressed]}
                >
                  <Text style={styles.noticeActionText}>
                    {lt("Show all earnings", "Показать все начисления", "הצג את כל השכר")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {projectScopeActive ? (
            <View style={[styles.notice, styles.scopeNotice]}>
              <Ionicons name="business-outline" size={18} color={installerTheme.info} />
              <View style={styles.noticeBody}>
                <Text style={[styles.noticeText, styles.scopeNoticeText]}>
                  {lt(
                    `Focused project ${context?.projectId}`,
                    `Фокус по объекту ${context?.projectId}`,
                    `מיקוד פרויקט ${context?.projectId}`
                  )}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={lt("Show all earnings", "Показать все начисления", "הצג את כל השכר")}
                  onPress={() => router.replace("/earnings" as never)}
                  style={({ pressed }) => [styles.noticeAction, pressed && styles.pressed]}
                >
                  <Text style={styles.noticeActionText}>
                    {lt("Show all earnings", "Показать все начисления", "הצג את כל השכר")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.metrics}>
            <MetricTile label={lt("Quantity", "Количество", "כמות")} value={Number.isInteger(totalQuantity) ? totalQuantity : totalQuantity.toFixed(2)} meta={`${rows.length} ${lt("rows", "строк", "שורות")}`} tone="success" />
            <MetricTile label={lt("Projects", "Объекты", "פרויקטים")} value={projectCount} meta={lt("with completed work", "с выполненными работами", "עם עבודה שהושלמה")} tone="accent" />
            <MetricTile label={lt("Days", "Дни", "ימים")} value={dayLanes.length} meta={lt("in current view", "в выбранном периоде", "בתצוגה")} tone="info" />
          </View>

          <SectionCard>
            <SectionHeader title={lt("Period", "Период", "תקופה")} />
            <SegmentedControl
              value={focus}
              onChange={setFocus}
              options={[
                { value: "TODAY", label: lt("Today", "Сегодня", "היום") },
                { value: "MONTH", label: lt("Month", "Месяц", "חודש") },
                { value: "DAY", label: lt("Day", "День", "יום") },
              ]}
            />
            {days.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {days.map((day) => (
                  <Pressable
                    key={day}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focus === "DAY" && selectedDay === day }}
                    accessibilityLabel={dateLabel(day)}
                    onPress={() => {
                      setFocus("DAY");
                      setSelectedDay(day);
                    }}
                    style={[styles.chip, focus === "DAY" && selectedDay === day && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, focus === "DAY" && selectedDay === day && styles.chipTextActive]}>
                      {dateLabel(day)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {installTypes.length ? (
              <>
                <Text style={styles.fieldLabel}>{lt("Install type", "Тип монтажа", "סוג התקנה")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  <FilterChip active={installType === "ALL"} label={lt("All types", "Все типы", "כל הסוגים")} onPress={() => setInstallType("ALL")} />
                  {installTypes.map((item) => (
                    <FilterChip key={item.code} active={installType === item.code} label={item.label} onPress={() => setInstallType(item.code)} />
                  ))}
                </ScrollView>
              </>
            ) : null}
          </SectionCard>

          {tab === "BREAKDOWN" ? (
            <>
              <SectionCard>
                <SectionHeader title={lt("By work type", "По типу работ", "לפי סוג עבודה")} meta={installTypes.length} />
                {installTypes.length ? (
                  <View style={styles.lineList}>
                    {installTypes.map((item) => (
                      <Pressable
                        key={item.code}
                        accessibilityRole="button"
                        accessibilityState={{ selected: installType === item.code }}
                        accessibilityLabel={`${item.label}. ${lt("Quantity", "Количество", "כמות")}: ${item.quantity}. ${money(item.amount)}`}
                        onPress={() => setInstallType(item.code)}
                        style={({ pressed }) => [
                          styles.line,
                          installType === item.code && styles.lineSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.lineIcon}>
                          <Text style={styles.lineIconText}>{item.label.slice(0, 1).toUpperCase()}</Text>
                        </View>
                        <View style={styles.lineBody}>
                          <Text style={styles.lineTitle} numberOfLines={1}>{item.label}</Text>
                          <Text style={styles.lineMeta}>{lt("Quantity", "Количество", "כמות")}: {item.quantity}</Text>
                        </View>
                        <Text style={styles.lineAmount}>{money(item.amount)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <EmptyState icon="cash-outline" title={lt("No earnings in this period", "В этом периоде нет начислений", "אין שכר בתקופה זו")} />
                )}
              </SectionCard>
              <SectionCard>
                <SectionHeader title={lt("Current total", "Итого по выборке", "סה״כ לתצוגה")} />
                <SummaryRow label={lt("Work rows", "Строки работ", "שורות עבודה")} value={String(rows.length)} />
                <SummaryRow label={lt("Quantity", "Количество", "כמות")} value={String(totalQuantity)} />
                <SummaryRow label={lt("Projects", "Объекты", "פרויקטים")} value={String(projectCount)} />
                <View style={styles.summaryGrand}>
                  <Text style={styles.summaryGrandLabel}>{lt("Total", "Итого", "סה״כ")}</Text>
                  <Text style={styles.summaryGrandValue}>{money(totalAmount)}</Text>
                </View>
              </SectionCard>
            </>
          ) : null}

          {tab === "PROJECTS" ? (
            <View style={styles.section}>
              <SectionHeader title={lt("By project", "По объектам", "לפי פרויקט")} meta={projectLanes.length} />
              {projectLanes.length ? projectLanes.map((lane) => {
                const open = openProjectKey === lane.key;
                return (
                  <SectionCard key={lane.key} style={styles.projectCard}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={`${lane.projectName}. ${money(lane.amount)}`}
                      onPress={() => setOpenProjectKey(open ? null : lane.key)}
                      style={({ pressed }) => [styles.projectHeader, pressed && styles.pressed]}
                    >
                      <View style={styles.projectIcon}>
                        <Ionicons name="business-outline" size={18} color={installerTheme.accentText} />
                      </View>
                      <View style={styles.projectBody}>
                        <Text style={styles.projectTitle} numberOfLines={1}>{lane.projectName}</Text>
                        <Text style={styles.projectMeta}>{lane.rows.length} {lt("rows", "строк", "שורות")} · {lane.quantity} {lt("units", "ед.", "יח׳")}</Text>
                      </View>
                      <View style={styles.projectRight}>
                        <Text style={styles.projectAmount}>{money(lane.amount)}</Text>
                        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color={installerTheme.textFaint} />
                      </View>
                    </Pressable>
                    {open ? (
                      <>
                        {lane.rows.slice(0, 10).map((row) => <EarningsLine key={row.id} row={row} money={money} />)}
                        {lane.projectId ? (
                          <View style={styles.projectActions}>
                            <ActionButton label={lt("Open project", "Открыть объект", "פתיחת פרויקט")} icon="briefcase-outline" variant="dark" style={styles.flex} onPress={() => router.push(buildProjectRoute(lane.projectId as string) as never)} />
                            <IconButton icon="alert-circle-outline" label={lt("Open issues", "Открыть проблемы", "פתיחת תקלות")} onPress={() => router.push(buildIssueProjectRoute(lane.projectId as string, { doorSearch: lane.projectName }) as never)} />
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </SectionCard>
                );
              }) : (
                <SectionCard>
                  <EmptyState icon="business-outline" title={lt("No project earnings", "Нет начислений по объектам", "אין שכר לפי פרויקט")} />
                </SectionCard>
              )}
            </View>
          ) : null}

          {tab === "ROWS" ? (
            <>
              <SectionCard>
                <SectionHeader title={lt("By day", "По дням", "לפי יום")} meta={dayLanes.length} />
                {dayLanes.length ? dayLanes.map((lane) => (
                  <Pressable
                    key={lane.date}
                    accessibilityRole="button"
                    accessibilityLabel={`${dateLabel(lane.date)}. ${money(lane.amount)}`}
                    onPress={() => router.push(`/calendar?day=${encodeURIComponent(lane.date)}` as never)}
                    style={({ pressed }) => [styles.dayRow, pressed && styles.pressed]}
                  >
                    <View style={styles.dayIcon}>
                      <Text style={styles.dayIconText}>{lane.date.slice(8, 10)}</Text>
                    </View>
                    <View style={styles.lineBody}>
                      <Text style={styles.lineTitle}>{dateLabel(lane.date)}</Text>
                      <Text style={styles.lineMeta}>{lane.rows} {lt("rows", "строк", "שורות")} · {lane.quantity} {lt("units", "ед.", "יח׳")}</Text>
                    </View>
                    <Text style={styles.lineAmount}>{money(lane.amount)}</Text>
                    <Ionicons name="chevron-forward" size={15} color={installerTheme.textFaint} />
                  </Pressable>
                )) : (
                  <EmptyState icon="calendar-outline" title={lt("No daily rows", "Нет начислений по дням", "אין שורות יומיות")} />
                )}
              </SectionCard>
              <SectionCard>
                <SectionHeader title={lt("Work details", "Детализация работ", "פירוט עבודות")} meta={rows.length} />
                {rows.length ? rows.slice(0, 30).map((row) => (
                  <View key={row.id}>
                    <EarningsLine row={row} money={money} />
                    {row.project_id ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${lt("Open project", "Открыть объект", "פתיחת פרויקט")}. ${row.project_name || ""}`}
                        onPress={() => router.push(buildProjectRoute(row.project_id as string) as never)}
                        style={({ pressed }) => [styles.inlineLink, pressed && styles.pressed]}
                      >
                        <Text style={styles.inlineLinkText}>{lt("Open project", "Открыть объект", "פתיחת פרויקט")}</Text>
                        <Ionicons name="arrow-forward" size={14} color={installerTheme.info} />
                      </Pressable>
                    ) : null}
                  </View>
                )) : (
                  <EmptyState icon="receipt-outline" title={lt("No work rows", "Нет строк работ", "אין שורות עבודה")} />
                )}
              </SectionCard>
            </>
          ) : null}
        </View>
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function EarningsLine({ row, money }: { row: InstallerEarningsRow; money: (value: number | string) => string }) {
  return (
    <View style={styles.line}>
      <View style={[styles.lineIcon, styles.lineIconSuccess]}>
        <Ionicons name="checkmark" size={15} color={installerTheme.success} />
      </View>
      <View style={styles.lineBody}>
        <Text style={styles.lineTitle} numberOfLines={1}>{row.door_label || row.project_name || row.install_type_label}</Text>
        <Text style={styles.lineMeta} numberOfLines={1}>{row.install_type_label} · {row.quantity} × {row.rate}</Text>
      </View>
      <Text style={styles.lineAmount}>{money(row.amount)}</Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  content: { flex: 1 },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  periodNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.shellOverlaySubtle,
    padding: 3,
    marginTop: 15,
  },
  periodBody: { flex: 1, alignItems: "center", minWidth: 0 },
  periodTitle: { color: installerTheme.textOnDark, fontSize: 12, fontWeight: "800" },
  periodMeta: { color: installerTheme.textFaint, fontSize: 9, marginTop: 2 },
  totalLabel: { color: installerTheme.textFaint, fontSize: 9, fontWeight: "800", marginTop: 16 },
  totalValue: { color: installerTheme.accent, fontFamily: installerTheme.fontFamilyMono, fontSize: 32, lineHeight: 38 },
  heroStatus: { alignSelf: "flex-start", marginTop: 7, marginBottom: 10 },
  body: { gap: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.warningBorder,
    backgroundColor: installerTheme.warningSoft,
    padding: 11,
  },
  scopeNotice: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.infoSoft },
  scopeNoticeText: { color: installerTheme.info },
  noticeBody: { flex: 1, minWidth: 0, gap: 8 },
  noticeText: { flex: 1, color: installerTheme.warning, fontSize: 11, lineHeight: 16 },
  noticeAction: {
    alignSelf: "flex-start",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  noticeActionText: { color: installerTheme.text, fontSize: 10, fontWeight: "800" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chips: { gap: 7, paddingEnd: 12, marginTop: 9 },
  chip: {
    maxWidth: 220,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 12,
  },
  chipActive: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.primarySoft },
  chipText: { color: installerTheme.textMuted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: installerTheme.info },
  fieldLabel: { color: installerTheme.textMuted, fontSize: 9, fontWeight: "800", textTransform: "uppercase", marginTop: 13 },
  section: { gap: 8 },
  lineList: { marginTop: 8 },
  line: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  lineSelected: { backgroundColor: installerTheme.accentWarm },
  lineIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.accentWarm },
  lineIconSuccess: { backgroundColor: installerTheme.successSoft },
  lineIconText: { color: installerTheme.accentText, fontSize: 11, fontWeight: "900" },
  lineBody: { flex: 1, minWidth: 0 },
  lineTitle: { color: installerTheme.text, fontSize: 11, fontWeight: "800" },
  lineMeta: { color: installerTheme.textMuted, fontSize: 9, marginTop: 3 },
  lineAmount: { color: installerTheme.success, fontFamily: installerTheme.fontFamilyMono, fontSize: 11, flexShrink: 0 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  summaryLabel: { color: installerTheme.textMuted, fontSize: 11 },
  summaryValue: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 11 },
  summaryGrand: { flexDirection: "row", justifyContent: "space-between", gap: 10, borderTopWidth: 1, borderTopColor: installerTheme.borderStrong, paddingTop: 12, marginTop: 3 },
  summaryGrandLabel: { color: installerTheme.text, fontSize: 13, fontWeight: "800" },
  summaryGrandValue: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 17 },
  projectCard: { padding: 0, overflow: "hidden", borderColor: installerTheme.borderStrong, backgroundColor: installerTheme.shellRaised },
  projectHeader: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  projectIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.accentWarm },
  projectBody: { flex: 1, minWidth: 0 },
  projectTitle: { color: installerTheme.text, fontSize: 12, fontWeight: "800" },
  projectMeta: { color: installerTheme.textMuted, fontSize: 9, marginTop: 3 },
  projectRight: { alignItems: "flex-end", gap: 4 },
  projectAmount: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 12 },
  projectActions: { flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderTopColor: installerTheme.border, backgroundColor: installerTheme.card, padding: 10 },
  dayRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  dayIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.infoSoft },
  dayIconText: { color: installerTheme.info, fontFamily: installerTheme.fontFamilyMono, fontSize: 11 },
  inlineLink: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 7 },
  inlineLinkText: { color: installerTheme.info, fontSize: 10, fontWeight: "800" },
  flex: { flex: 1 },
  pressed: { opacity: 0.68 },
});
