import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { DirectionalChevron, chevronIcon } from "@/components/directional-chevron";
import { SkeletonList } from "@/components/skeleton";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import { EarningsDayChart, buildEarningsDayChart } from "@/components/earnings-day-chart";
import { Reveal, useReducedMotion } from "@/components/motion";
import {
  ActionButton,
  AnimatedNumber,
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
import { currentLocalDateKey, parseLocalDateKey } from "@/lib/date-key";
import { isRtlLocale } from "@/lib/i18n";
import { installerTheme } from "@/lib/theme";
import {
  buildScopedEarningsFocusContext,
  type EarningsPeriodFocus,
} from "@/modules/earnings/presentation";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import type { InstallerEarningsRow, InstallerEarningsViewModel } from "@/modules/earnings/types";
import { sumEarningsValues } from "@/modules/earnings/decimal";
import { buildProjectRoute } from "@/modules/projects/navigation";
import { useAuth, useI18n } from "@/providers/AppProviders";

type EarningsTab = "BREAKDOWN" | "PROJECTS" | "ROWS";
const EMPTY_EARNINGS: InstallerEarningsViewModel = { snapshot: null, source: "unavailable", message: null };

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]?.trim() || "" : typeof value === "string" ? value.trim() : "";
}

function queryFocus(value: string | string[] | undefined): EarningsPeriodFocus | null {
  const normalized = queryValue(value).toUpperCase();
  return normalized === "TODAY" || normalized === "MONTH" || normalized === "DAY" ? normalized : null;
}

export default function EarningsScreen() {
  const { user, syncVersion } = useAuth();
  const { locale } = useI18n();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ focus?: string; day?: string; project_id?: string }>();
  const today = currentLocalDateKey();
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<EarningsPeriodFocus>(queryFocus(params.focus) || "MONTH");
  const [selectedDay, setSelectedDay] = useState(parseLocalDateKey(queryValue(params.day)) || today);
  const anchorDay = focus === "DAY" ? selectedDay : today;
  const scopeKey = `${user?.company_id || ""}:${user?.id || ""}:${anchorDay.slice(0, 7)}`;
  const [loaded, setLoaded] = useState<{ key: string; value: InstallerEarningsViewModel } | null>(null);
  const state = loaded?.key === scopeKey ? loaded.value : EMPTY_EARNINGS;
  const loadRevision = useRef(0);
  const [installType, setInstallType] = useState("ALL");
  const [tab, setTab] = useState<EarningsTab>("BREAKDOWN");
  const [openProjectKey, setOpenProjectKey] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";
  const quantityLabel = (value: number) => new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 }).format(value);

  const reload = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoading(true);
    try {
      const value = await loadInstallerEarnings("month", anchorDay);
      if (revision === loadRevision.current) setLoaded({ key: scopeKey, value });
    } catch (reason) {
      if (revision === loadRevision.current) setLoaded({ key: scopeKey, value: {
        snapshot: null,
        source: "unavailable",
        message: reason instanceof Error ? reason.message : "Earnings loading failed.",
      } });
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }, [anchorDay, scopeKey]);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { loadRevision.current += 1; };
  }, [reload, syncVersion]));

  useEffect(() => {
    const incomingFocus = queryFocus(params.focus);
    const incomingDay = parseLocalDateKey(queryValue(params.day));
    setFocus(incomingFocus || "MONTH");
    setSelectedDay(incomingDay || currentLocalDateKey());
  }, [params.day, params.focus]);

  const snapshot = state.snapshot;
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
  const selectedRow = rows.find((row) => row.id === selectedRowId) || null;
  const days = useMemo(
    () => Array.from(new Set([...(snapshot?.rows || []).filter((row) => !focusedProjectId || row.project_id === focusedProjectId).map((row) => row.work_date), ...(focus === "DAY" ? [selectedDay] : [])])).sort(),
    [snapshot?.rows, focusedProjectId, focus, selectedDay]
  );
  const dayLanes = useMemo(() => {
    const lanes = new Map<string, { date: string; amount: number; quantity: number; rows: number }>();
    for (const row of rows) {
      const current = lanes.get(row.work_date) || { date: row.work_date, amount: 0, quantity: 0, rows: 0 };
      current.amount = sumEarningsValues([current.amount, row.amount]);
      current.quantity = sumEarningsValues([current.quantity, row.quantity]);
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
      current.amount = sumEarningsValues([current.amount, row.amount]);
      current.quantity = sumEarningsValues([current.quantity, row.quantity]);
      current.rows.push(row);
      lanes.set(key, current);
    }
    return Array.from(lanes.values()).sort((left, right) => right.amount - left.amount);
  }, [rows, locale]);
  // The whole period, so a single selected day still shows its neighbours.
  const chartBars = useMemo(
    () => buildEarningsDayChart((snapshot?.rows || []).filter((row) =>
      (!focusedProjectId || row.project_id === focusedProjectId) && (installType === "ALL" || row.install_type_code === installType))),
    [snapshot?.rows, focusedProjectId, installType]
  );
  const totalAmount = sumEarningsValues(rows.map((row) => row.amount));
  const totalQuantity = sumEarningsValues(rows.map((row) => row.quantity));
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
    if (installType !== "ALL" && !installTypes.some((item) => item.code === installType)) {
      setInstallType("ALL");
    }
  }, [installType, installTypes]);

  useEffect(() => {
    if (openProjectKey && !projectLanes.some((lane) => lane.key === openProjectKey)) {
      setOpenProjectKey(null);
    }
  }, [openProjectKey, projectLanes]);

  useEffect(() => {
    if (selectedRowId && !selectedRow) setSelectedRowId(null);
  }, [selectedRowId, selectedRow]);

  const money = (amount: number | string) => {
    const value = Number(amount);
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
    new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "short", weekday: "short", year: date.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined })
      .format(new Date(`${date}T12:00:00`));
  const periodLabel =
    focus === "TODAY"
      ? lt("Today", "Сегодня", "היום")
      : focus === "DAY" && selectedDay
        ? dateLabel(selectedDay)
        : lt("This month", "Этот месяц", "החודש");

  const activeDay = focus === "DAY" ? selectedDay : today;
  const previousDay = [...days].reverse().find((day) => day < activeDay);
  const nextDay = days.find((day) => day > activeDay);
  const moveDay = (day: string | undefined) => {
    if (!day) return;
    setFocus("DAY");
    setSelectedDay(day);
  };
  const navigate = (route: string) => { setSelectedRowId(null); router.push(route as never); };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          showMark={false}
          eyebrow={lt("EARNINGS", "ЗАРАБОТОК", "שכר")}
          title={user?.full_name || "DIMAX Installer"}
          subtitle={lt("Accruals for completed work", "Начисления по выполненным работам", "צבירות עבור עבודות שהושלמו")}
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
            <IconButton icon={chevronIcon(isRtlLocale(locale), "back")} label={lt("Previous day", "Предыдущий день", "יום קודם")} tone="dark" disabled={!previousDay || !snapshot} onPress={() => moveDay(previousDay)} />
            <View style={styles.periodBody}>
              <Text style={styles.periodTitle}>{periodLabel}</Text>
              <Text style={styles.periodMeta}>{snapshot ? rows.length : "—"} {lt("work rows", "строк работ", "שורות עבודה")}</Text>
            </View>
            <IconButton icon={chevronIcon(isRtlLocale(locale), "forward")} label={lt("Next day", "Следующий день", "יום הבא")} tone="dark" disabled={!nextDay || !snapshot} onPress={() => moveDay(nextDay)} />
          </View>
          <Text style={styles.totalLabel}>{lt("EARNINGS IN VIEW", "ЗАРАБОТОК В ВЫБРАННОМ ПЕРИОДЕ", "שכר בתקופה")}</Text>
          {snapshot
            ? <AnimatedNumber testID="earnings-total" value={totalAmount} format={money} style={[styles.totalValue, totalAmount < 0 && styles.debit]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} />
            : <Text testID="earnings-total" style={styles.totalValue} numberOfLines={1}>—</Text>}
          <View style={styles.heroStatus}>
            <StatusPill
              label={
                loading ? lt("Loading earnings", "Загрузка начислений", "טעינת שכר") : state.source === "online"
                  ? lt("Live data", "Актуальные данные", "נתונים עדכניים")
                  : state.source === "cache"
                    ? lt("Offline cache", "Офлайн-копия", "עותק לא מקוון")
                    : lt("Unavailable", "Недоступно", "לא זמין")
              }
              tone={loading ? "neutral" : state.source === "online" ? "success" : state.source === "cache" ? "warning" : "danger"}
            />
          </View>
          <SegmentedControl
            value={tab}
            onChange={setTab}
            dark
            options={[
              { value: "BREAKDOWN", label: lt("Types", "Типы", "סוגים"), count: snapshot ? installTypes.length : undefined },
              { value: "PROJECTS", label: lt("Projects", "Объекты", "פרויקטים"), count: snapshot ? projectLanes.length : undefined },
              { value: "ROWS", label: lt("Details", "Детали", "פירוט"), count: snapshot ? rows.length : undefined },
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
                    "No earnings for this project in the selected month.",
                    "В выбранном месяце нет начислений по этому объекту.",
                    "אין שכר לפרויקט זה בחודש שנבחר."
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
                    `Project: ${snapshot?.rows.find((row) => row.project_id === focusedProjectId)?.project_name || "—"}`,
                    `Объект: ${snapshot?.rows.find((row) => row.project_id === focusedProjectId)?.project_name || "—"}`,
                    `פרויקט: ${snapshot?.rows.find((row) => row.project_id === focusedProjectId)?.project_name || "—"}`
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
            <MetricTile label={lt("Quantity", "Количество", "כמות")} value={!snapshot ? "—" : quantityLabel(totalQuantity)} meta={`${snapshot ? rows.length : "—"} ${lt("rows", "строк", "שורות")}`} tone="success" />
            <MetricTile label={lt("Projects", "Объекты", "פרויקטים")} value={snapshot ? projectCount : "—"} meta={lt("with completed work", "с выполненными работами", "עם עבודה שהושלמה")} tone="accent" />
            <MetricTile label={lt("Days", "Дни", "ימים")} value={snapshot ? dayLanes.length : "—"} meta={lt("in current view", "в выбранном периоде", "בתצוגה")} tone="info" />
          </View>

          {snapshot && chartBars.length > 1 ? (
            <SectionCard>
              <SectionHeader title={lt("Daily trend", "Динамика по дням", "מגמה יומית")} meta={chartBars.length} />
              <EarningsDayChart
                bars={chartBars}
                selectedDate={focus === "DAY" ? selectedDay : focus === "TODAY" ? today : null}
                today={today}
                dateLabel={dateLabel}
                money={money}
                onSelect={(date) => { setFocus("DAY"); setSelectedDay(date); }}
                testID="earnings-day-chart"
              />
            </SectionCard>
          ) : null}

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

          {!snapshot ? (
            <SectionCard>
              {loading ? <SkeletonList variant="rows" rows={4} label={lt("Loading earnings", "Загрузка начислений", "טעינת שכר")} testID="earnings-loading" /> : <EmptyState icon="cloud-offline-outline" title={lt("Earnings unavailable", "Начисления недоступны", "השכר אינו זמין")} action={<ActionButton label={lt("Retry", "Повторить", "ניסיון נוסף")} icon="refresh" onPress={() => void reload()} />} />}
            </SectionCard>
          ) : <>
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
                        accessibilityLabel={`${item.label}. ${lt("Quantity", "Количество", "כמות")}: ${quantityLabel(item.quantity)}. ${money(item.amount)}`}
                        onPress={() => { setInstallType(item.code); setTab("ROWS"); }}
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
                          <Text style={styles.lineMeta}>{lt("Quantity", "Количество", "כמות")}: {quantityLabel(item.quantity)}</Text>
                        </View>
                        <Text style={[styles.lineAmount, item.amount < 0 && styles.debit]}>{money(item.amount)}</Text>
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
                <SummaryRow label={lt("Quantity", "Количество", "כמות")} value={quantityLabel(totalQuantity)} />
                <SummaryRow label={lt("Projects", "Объекты", "פרויקטים")} value={String(projectCount)} />
                <View style={styles.summaryGrand}>
                  <Text style={styles.summaryGrandLabel}>{lt("Total", "Итого", "סה״כ")}</Text>
                  <Text style={[styles.summaryGrandValue, totalAmount < 0 && styles.debit]}>{money(totalAmount)}</Text>
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
                        <Text style={styles.projectTitle} numberOfLines={2}>{lane.projectName}</Text>
                        <Text style={styles.projectMeta}>{lane.rows.length} {lt("rows", "строк", "שורות")} · {quantityLabel(lane.quantity)} {lt("units", "ед.", "יח׳")}</Text>
                      </View>
                      <View style={styles.projectRight}>
                        <Text style={[styles.projectAmount, lane.amount < 0 && styles.debit]}>{money(lane.amount)}</Text>
                        {open
                          ? <Ionicons name="chevron-down" size={16} color={installerTheme.textFaint} />
                          : <DirectionalChevron size={16} color={installerTheme.textFaint} />}
                      </View>
                    </Pressable>
                    {open ? (
                      <>
                        <View style={styles.projectRows}><EarningsRows rows={lane.rows} money={money} onSelect={setSelectedRowId} initialLimit={10} /></View>
                        {lane.projectId ? (
                          <View style={styles.projectActions}>
                            <ActionButton label={lt("Open project", "Открыть объект", "פתיחת פרויקט")} icon="briefcase-outline" variant="dark" style={styles.flex} onPress={() => router.push(buildProjectRoute(lane.projectId as string) as never)} />
                            <IconButton icon="alert-circle-outline" label={lt("Open issues", "Открыть проблемы", "פתיחת תקלות")} onPress={() => navigate(`/issues?projectId=${encodeURIComponent(lane.projectId as string)}`)} />
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
                    onPress={() => { setFocus("DAY"); setSelectedDay(lane.date); }}
                    style={({ pressed }) => [styles.dayRow, pressed && styles.pressed]}
                  >
                    <View style={styles.dayIcon}>
                      <Text style={styles.dayIconText}>{lane.date.slice(8, 10)}</Text>
                    </View>
                    <View style={styles.lineBody}>
                      <Text style={styles.lineTitle}>{dateLabel(lane.date)}</Text>
                      <Text style={styles.lineMeta}>{lane.rows} {lt("rows", "строк", "שורות")} · {quantityLabel(lane.quantity)} {lt("units", "ед.", "יח׳")}</Text>
                    </View>
                    <Text style={[styles.lineAmount, lane.amount < 0 && styles.debit]}>{money(lane.amount)}</Text>
                    <DirectionalChevron size={15} color={installerTheme.textFaint} />
                  </Pressable>
                )) : (
                  <EmptyState icon="calendar-outline" title={lt("No daily rows", "Нет начислений по дням", "אין שורות יומיות")} />
                )}
              </SectionCard>
              <SectionCard>
                <SectionHeader title={lt("Work details", "Детализация работ", "פירוט עבודות")} meta={rows.length} />
                {rows.length ? <EarningsRows rows={rows} money={money} onSelect={setSelectedRowId} /> : (
                  <EmptyState icon="receipt-outline" title={lt("No work rows", "Нет строк работ", "אין שורות עבודה")} />
                )}
              </SectionCard>
            </>
          ) : null}
          </>}
        </View>
      </ScrollView>
      <InstallerBottomNav />
      {selectedRow ? (
        <Modal visible transparent statusBarTranslucent animationType={reducedMotion ? "none" : "fade"} onRequestClose={() => setSelectedRowId(null)}>
          <SafeAreaView style={[styles.modalRoot, { direction: locale === "he" ? "rtl" : "ltr" }]} edges={["top", "bottom", "left", "right"]}>
            <Pressable feedback="none" accessibilityRole="button" accessibilityLabel={lt("Dismiss work details", "Закрыть окно начисления", "סגירת חלון השכר")} style={styles.modalBackdrop} onPress={() => setSelectedRowId(null)} />
            <View testID="earnings-work-details" accessibilityViewIsModal onAccessibilityEscape={() => setSelectedRowId(null)} style={styles.modalPanel}>
              <View style={styles.modalHeader}>
                <StatusPill label={Number(selectedRow.amount) < 0 ? lt("Deduction", "Уменьшение", "הפחתה") : lt("Accrual", "Начисление", "צבירה")} tone={Number(selectedRow.amount) < 0 ? "danger" : "success"} />
                <IconButton icon="close" label={lt("Close work details", "Закрыть детали начисления", "סגירת פרטי השכר")} onPress={() => setSelectedRowId(null)} />
              </View>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBody}>
                <Text style={styles.detailTitle}>{selectedRow.door_label || selectedRow.install_type_label}</Text>
                <Text style={[styles.detailAmount, Number(selectedRow.amount) < 0 && styles.debit]}>{money(selectedRow.amount)}</Text>
                {state.source === "cache" ? <StatusPill label={lt("Offline cache", "Офлайн-копия", "עותק לא מקוון")} tone="warning" /> : null}
                <SummaryRow label={lt("Date", "Дата", "תאריך")} value={dateLabel(selectedRow.work_date)} />
                <SummaryRow label={lt("Project", "Объект", "פרויקט")} value={selectedRow.project_name || lt("No project", "Без объекта", "ללא פרויקט")} />
                <SummaryRow label={lt("Work type", "Тип работы", "סוג עבודה")} value={selectedRow.install_type_label} />
                <SummaryRow label={lt("Quantity", "Количество", "כמות")} value={quantityLabel(selectedRow.quantity)} />
                <SummaryRow label={lt("Rate", "Ставка", "תעריף")} value={money(selectedRow.rate)} />
                <View style={styles.projectActions}>
                  {selectedRow.project_id ? <ActionButton label={lt("Open project", "Открыть объект", "פתיחת פרויקט")} icon="briefcase-outline" variant="dark" style={styles.flex} onPress={() => navigate(buildProjectRoute(selectedRow.project_id!))} /> : null}
                  <IconButton icon="calendar-outline" label={lt("Open day's calendar", "Календарь за этот день", "לוח שנה ליום זה")} onPress={() => navigate(`/calendar?day=${encodeURIComponent(selectedRow.work_date)}`)} />
                </View>
              </ScrollView>
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
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

function EarningsRows({ rows, money, onSelect, initialLimit = 30 }: { rows: InstallerEarningsRow[]; money: (value: number | string) => string; onSelect: (id: string) => void; initialLimit?: number }) {
  const { locale } = useI18n();
  const [limit, setLimit] = useState(initialLimit);
  useEffect(() => setLimit(initialLimit), [rows, initialLimit]);
  return <View>
    {rows.slice(0, limit).map((row, index) => (
      <Reveal key={row.id} index={index} tilt>
        <EarningsLine row={row} money={money} onPress={() => onSelect(row.id)} />
      </Reveal>
    ))}
    {rows.length > initialLimit ? <Text style={styles.pageCount}>{Math.min(limit, rows.length)} / {rows.length}</Text> : null}
    {limit < rows.length ? <ActionButton label={locale === "ru" ? "Показать ещё" : locale === "he" ? "הצגת עוד" : "Show more work"} icon="chevron-down" variant="secondary" onPress={() => setLimit((value) => value + initialLimit)} /> : null}
  </View>;
}

function EarningsLine({ row, money, onPress }: { row: InstallerEarningsRow; money: (value: number | string) => string; onPress: () => void }) {
  const { locale } = useI18n();
  const quantity = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB", { maximumFractionDigits: 2 }).format(row.quantity);
  const debit = Number(row.amount) < 0;
  const label = row.door_label || row.project_name || row.install_type_label;
  return (
    <Pressable testID={`earnings-row-${row.id}`} accessibilityRole="button" accessibilityLabel={`${label}. ${money(row.amount)}`} onPress={onPress} style={({ pressed }) => [styles.line, pressed && styles.pressed]}>
      <View style={[styles.lineIcon, debit ? styles.lineIconDebit : styles.lineIconSuccess]}>
        <Ionicons name={debit ? "remove" : "checkmark"} size={15} color={debit ? installerTheme.danger : installerTheme.success} />
      </View>
      <View style={styles.lineBody}>
        <Text style={styles.lineTitle} numberOfLines={2}>{label}</Text>
        <Text style={styles.lineMeta} numberOfLines={2}>{row.install_type_label} · {quantity} × {money(row.rate)}</Text>
      </View>
      <Text style={[styles.lineAmount, debit && styles.debit]}>{money(row.amount)}</Text>
      <DirectionalChevron size={14} color={installerTheme.textFaint} />
    </Pressable>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { locale } = useI18n();
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { textAlign: locale === "he" ? "left" : "right" }]}>{value}</Text>
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
  periodMeta: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, marginTop: 2 },
  totalLabel: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, fontWeight: "800", marginTop: 16 },
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
  noticeText: { flex: 1, color: installerTheme.warning, fontSize: installerTheme.type.caption, lineHeight: 16 },
  noticeAction: {
    alignSelf: "flex-start",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  noticeActionText: { color: installerTheme.text, fontSize: installerTheme.type.caption, fontWeight: "800" },
  modalRoot: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
  modalPanel: { width: "100%", maxWidth: 480, maxHeight: "90%", flexShrink: 1, borderWidth: 1, borderColor: installerTheme.borderStrong, borderRadius: installerTheme.radius.card, backgroundColor: installerTheme.shellRaised, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: installerTheme.border },
  modalScroll: { flexShrink: 1 },
  modalBody: { padding: 16, gap: 8 },
  detailTitle: { color: installerTheme.text, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  detailAmount: { color: installerTheme.success, fontFamily: installerTheme.fontFamilyMono, fontSize: 24, lineHeight: 32, flexShrink: 1 },
  debit: { color: installerTheme.danger },
  pageCount: { color: installerTheme.textMuted, textAlign: "center", fontSize: installerTheme.type.caption, marginVertical: 8 },
  projectRows: { paddingHorizontal: 12 },
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
  chipText: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, fontWeight: "700" },
  chipTextActive: { color: installerTheme.info },
  fieldLabel: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, fontWeight: "800", textTransform: "uppercase", marginTop: 13 },
  section: { gap: 8 },
  lineList: { marginTop: 8 },
  line: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  lineSelected: { backgroundColor: installerTheme.accentWarm },
  lineIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.accentWarm },
  lineIconSuccess: { backgroundColor: installerTheme.successSoft },
  lineIconDebit: { backgroundColor: installerTheme.dangerSoft },
  lineIconText: { color: installerTheme.accentText, fontSize: installerTheme.type.caption, fontWeight: "900" },
  lineBody: { flex: 1, minWidth: 0 },
  lineTitle: { color: installerTheme.text, fontSize: installerTheme.type.caption, fontWeight: "800" },
  lineMeta: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, marginTop: 3 },
  lineAmount: { color: installerTheme.success, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption, flexShrink: 1, maxWidth: "46%" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  summaryLabel: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, flexShrink: 1 },
  summaryValue: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption, flex: 1, textAlign: "right", lineHeight: 17 },
  summaryGrand: { flexDirection: "row", justifyContent: "space-between", gap: 10, borderTopWidth: 1, borderTopColor: installerTheme.borderStrong, paddingTop: 12, marginTop: 3 },
  summaryGrandLabel: { color: installerTheme.text, fontSize: 13, fontWeight: "800" },
  summaryGrandValue: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 17, flexShrink: 1 },
  projectCard: { padding: 0, overflow: "hidden", borderColor: installerTheme.borderStrong, backgroundColor: installerTheme.shellRaised },
  projectHeader: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  projectIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.accentWarm },
  projectBody: { flex: 1, minWidth: 0 },
  projectTitle: { color: installerTheme.text, fontSize: 12, fontWeight: "800" },
  projectMeta: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, marginTop: 3 },
  projectRight: { alignItems: "flex-end", gap: 4, maxWidth: "45%", flexShrink: 1 },
  projectAmount: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 12 },
  projectActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, borderTopWidth: 1, borderTopColor: installerTheme.border, backgroundColor: installerTheme.card, padding: 10 },
  dayRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingVertical: 9 },
  dayIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.infoSoft },
  dayIconText: { color: installerTheme.info, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption },
  flex: { flexGrow: 1, flexBasis: 150 },
  pressed: { opacity: 0.68 },
});
