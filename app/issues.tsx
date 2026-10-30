import { localizeWorkflowMessage } from "@/modules/sync/messages";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { DirectionalChevron } from "@/components/directional-chevron";
import { SkeletonList } from "@/components/skeleton";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import {
  ActionButton,
  BrandText as Text,
  EmptyState,
  IconButton,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { Reveal, useReducedMotion } from "@/components/motion";
import { installerTheme } from "@/lib/theme";
import { translateEnum } from "@/lib/i18n";
import {
  filterIssueScopesForRoute,
  isIssueRouteDoorMissing,
  isIssueRouteIssueMissing,
  isIssueRouteProjectMissing,
  resolveIssueRouteParams,
  type IssueRouteParams,
} from "@/modules/issues/presentation";
import { createIssue, reportIssueFixed } from "@/modules/issues/actions";
import { buildAiRoute } from "@/modules/ai/navigation";
import { buildDoorProjectRoute, buildProjectRoute } from "@/modules/projects/navigation";
import {
  listProjectDoors,
  listProjectIssues,
  listProjects,
} from "@/modules/projects/repository";
import type { InstallerDoor, ProjectIssue, ProjectListItem } from "@/modules/projects/types";
import {
  getSyncQueueSummary,
  runSync,
} from "@/modules/sync/service";
import { useAuth, useI18n } from "@/providers/AppProviders";

type IssueScope = {
  issue: ProjectIssue;
  project: ProjectListItem;
  door: InstallerDoor | null;
};

type ComposerStep = "CATEGORY" | "DETAILS" | "REVIEW";
type IssueFilter = "OPEN" | "ALL";

const CATEGORY_ICONS = {
  defective: "warning-outline",
  missing: "cube-outline",
  access: "key-outline",
  blocked: "construct-outline",
  mismatch: "resize-outline",
  other: "create-outline",
} as const;

export default function IssuesScreen() {
  const { user, syncVersion } = useAuth();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const routeParams = resolveIssueRouteParams(params);
  const scopeKey = JSON.stringify([user?.company_id, user?.id, routeParams]);
  return <IssuesWorkspace key={scopeKey} routeParams={routeParams} syncVersion={syncVersion} />;
}

type IssueSnapshot = { projects: ProjectListItem[]; doors: InstallerDoor[]; issues: IssueScope[]; queueCount: number };
const EMPTY_SNAPSHOT: IssueSnapshot = { projects: [], doors: [], issues: [], queueCount: 0 };

function IssuesWorkspace({ routeParams, syncVersion }: { routeParams: IssueRouteParams; syncVersion: number }) {
  const { locale, isRTL } = useI18n();
  const [snapshot, setSnapshot] = useState<IssueSnapshot | null>(null);
  const { projects, doors, issues, queueCount } = snapshot || EMPTY_SNAPSHOT;
  const loaded = snapshot !== null;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const focused = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const revision = useRef(0);
  const saveLock = useRef(false);
  const [search, setSearch] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [filter, setFilter] = useState<IssueFilter>("OPEN");
  const [composerOpen, setComposerOpen] = useState(routeParams.compose);
  const [step, setStep] = useState<ComposerStep>("CATEGORY");
  const [projectId, setProjectId] = useState(routeParams.projectId);
  const [doorId, setDoorId] = useState(routeParams.doorId);
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issueSaved, setIssueSaved] = useState(false);

  const lt = useCallback((en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en), [locale]);
  const categories = [
    { id: "defective", title: lt("Defective part", "Дефект детали", "חלק פגום"), hint: lt("crack, bend, broken hardware", "трещина, изгиб, поломка", "סדק, עיקום או שבר") },
    { id: "missing", title: lt("Missing or wrong item", "Нет детали или не та комплектация", "פריט חסר או שגוי"), hint: lt("part, key or specification", "деталь, ключ или спецификация", "חלק, מפתח או מפרט") },
    { id: "access", title: lt("Access problem", "Проблема доступа", "בעיית גישה"), hint: lt("locked area, code or client access", "закрытая зона, код или доступ", "אזור נעול, קוד או גישה") },
    { id: "blocked", title: lt("Site is not ready", "Объект не готов", "האתר לא מוכן"), hint: lt("opening, power or other work blocks install", "проём, электричество или другие работы мешают", "פתח, חשמל או עבודה אחרת חוסמים") },
    { id: "mismatch", title: lt("Specification mismatch", "Несоответствие спецификации", "אי התאמה למפרט"), hint: lt("size, type, marking or configuration", "размер, тип, маркировка или конфигурация", "מידה, סוג, סימון או תצורה") },
    { id: "other", title: lt("Something else", "Другая проблема", "בעיה אחרת"), hint: lt("describe it in your own words", "опишите своими словами", "תאר במילים שלך") },
  ];

  const reload = useCallback(async () => {
    const request = ++revision.current;
    setLoading(true);
    try {
      const [projectRows, queue] = await Promise.all([listProjects(), getSyncQueueSummary()]);
      const data = await Promise.all(projectRows.map(async (project) => {
        const [doorRows, issueRows] = await Promise.all([listProjectDoors(project.id), listProjectIssues(project.id)]);
        const byId = new Map(doorRows.map((door) => [door.id, door]));
        return { doors: doorRows, issues: issueRows.map((issue) => ({ issue, project, door: byId.get(issue.door_id) || null })) };
      }));
      if (!focused.current || revision.current !== request) return;
      setSnapshot({ projects: projectRows, doors: data.flatMap((item) => item.doors), issues: data.flatMap((item) => item.issues), queueCount: queue.total });
      setLoadError(null);
    } catch (reason) {
      if (focused.current && revision.current === request) setLoadError(reason instanceof Error ? localizeWorkflowMessage(reason.message, locale) : lt("Unable to load issues", "Не удалось загрузить проблемы", "לא ניתן לטעון תקלות"));
    } finally {
      if (focused.current && revision.current === request) setLoading(false);
    }
  }, [lt]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void reload();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void reload(); });
    return () => { focused.current = false; revision.current += 1; subscription.remove(); };
  }, [reload, syncVersion]));

  useEffect(() => {
    if (!loaded) return;
    const requestedDoor = doors.find((door) => door.id === routeParams.doorId);
    const targetProject = projectId || routeParams.projectId || requestedDoor?.project_id || projects[0]?.id || "";
    if (targetProject !== projectId) { setProjectId(targetProject); return; }
    if (doors.some((door) => door.id === doorId && door.project_id === targetProject)) return;
    // An explicit deep link must never fall back to an unrelated door.
    if (routeParams.doorId && (!routeParams.projectId || targetProject === routeParams.projectId)) return;
    setDoorId(doors.find((door) => door.project_id === targetProject)?.id || "");
  }, [loaded, projects, doors, projectId, doorId, routeParams.projectId, routeParams.doorId]);

  const selectedProject = projects.find((project) => project.id === projectId) || null;
  const selectedDoor = doors.find((door) => door.id === doorId && door.project_id === projectId) || null;
  const selectedCategory = categories.find((item) => item.id === category) || null;
  const projectDoors = doors.filter((door) => door.project_id === projectId);
  const routeProjectMissing = isIssueRouteProjectMissing(
    projects,
    routeParams.projectId,
    loaded,
  );
  const routeDoorMissing = isIssueRouteDoorMissing(
    doors,
    routeParams.projectId,
    routeParams.doorId,
    loaded,
  );
  const routeIssueMissing = isIssueRouteIssueMissing(
    issues,
    routeParams.issueId,
    routeParams.projectId,
    loaded,
  );
  const routeProjectActive = Boolean(
    routeParams.projectId && loaded && !routeProjectMissing,
  );
  const routeIssueActive = Boolean(
    routeParams.issueId && loaded && !routeIssueMissing,
  );
  const scopedIssues = useMemo(() => filterIssueScopesForRoute(issues, {
    projectId: routeParams.projectId, issueId: routeParams.issueId, statusFilter: "ALL",
  }), [issues, routeParams.projectId, routeParams.issueId]);
  const visibleIssues = useMemo(() => filterIssueScopesForRoute(scopedIssues, {
    projectId: "", issueId: routeParams.issueId, statusFilter: filter,
  }).filter(({ issue, project, door }) =>
    [issue.title, issue.details, project.name, door?.unit_label].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ), [scopedIssues, filter, routeParams.issueId, search]);
  const openCount = scopedIssues.filter((item) => item.issue.status !== "CLOSED").length;
  const selectedIssue = scopedIssues.find(({ issue }) => issue.id === selectedIssueId) || null;
  const canCompose = loaded && !loadError && !routeProjectMissing && !routeDoorMissing && doors.length > 0;
  const canSave = canCompose && Boolean(selectedProject && selectedDoor && selectedCategory);
  const closeComposer = () => { if (!saveLock.current) setComposerOpen(false); };

  const queueIssue = async () => {
    if (saveLock.current || !canSave || !selectedProject || !selectedDoor || !selectedCategory) return;
    saveLock.current = true;
    setBusy(true);
    setError(null);
    setIssueSaved(false);
    try {
      await createIssue({
        projectId: selectedProject.id, doorId: selectedDoor.id,
        title: selectedCategory.title, details: details.trim(),
      });
    } catch (reason) {
      if (alive.current) {
        setError(reason instanceof Error ? localizeWorkflowMessage(reason.message, locale) : lt("Unable to save issue", "Не удалось сохранить проблему", "לא ניתן לשמור את התקלה"));
        setBusy(false);
      }
      saveLock.current = false;
      return;
    }
    // The durable write succeeded. A later sync/read failure is not a failed save.
    if (!alive.current) { saveLock.current = false; return; }
    setComposerOpen(false);
    setStep("CATEGORY");
    setCategory("");
    setDetails("");
    setIssueSaved(true);
    try {
      if (focused.current) await runSync({ forceRetry: true });
    } catch {
      // Keep the issue in the existing durable outbox for retry.
    }
    if (focused.current) await reload();
    if (alive.current) setBusy(false);
    saveLock.current = false;
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.issueBody}>
              <Text style={styles.composerEyebrow}>{lt("FIELD WORK", "РАБОТА НА ОБЪЕКТЕ", "עבודה בשטח")}</Text>
              <Text style={styles.heading} accessibilityRole="header">{lt("Issues", "Проблемы", "תקלות")}</Text>
            </View>
            <IconButton icon="sparkles-outline" label={lt("Ask DIMAX AI", "Спросить DIMAX AI", "לשאול את DIMAX AI")} tone="dark" testID="issues-ai-header"
              onPress={() => router.push(buildAiRoute() as never)} />
            <IconButton icon="cloud-upload-outline" label={lt("Open sync queue", "Открыть очередь работ", "פתיחת תור הסנכרון")} tone="dark" onPress={() => router.push("/sync-queue" as never)} />
          </View>
          {loaded ? <View style={styles.summaryRow}>
            <StatusPill label={lt(`Open: ${openCount}`, `Открыто: ${openCount}`, `פתוחות: ${openCount}`)} tone={openCount ? "danger" : "success"} />
            <StatusPill label={lt(`Queued actions: ${queueCount}`, `В очереди работ: ${queueCount}`, `פעולות בתור: ${queueCount}`)} tone={queueCount ? "warning" : "neutral"} />
          </View> : null}
          <ActionButton label={lt("Flag a new issue", "Сообщить о проблеме", "דווח על תקלה")} icon="add" disabled={!canCompose || busy} onPress={() => setComposerOpen(true)} />
        </View>

        <View style={styles.body}>
          {loadError ? <View style={styles.loadError} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{loadError}</Text>
            <ActionButton label={lt("Try again", "Повторить", "ניסיון נוסף")} icon="refresh" variant="secondary" loading={loading} onPress={() => void reload()} />
          </View> : null}
          {!loaded ? loading ? <SkeletonList variant="rows" rows={4} label={lt("Loading issues", "Загрузка проблем", "טעינת תקלות")} testID="issues-loading" />
            : <EmptyState icon="cloud-offline-outline" title={lt("Issues unavailable", "Проблемы недоступны", "התקלות אינן זמינות")} />
          : null}
          {issueSaved ? (
            <View style={styles.successBox} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle-outline" size={18} color={installerTheme.success} />
              <Text style={styles.successText}>{lt("Issue saved on this phone.", "Проблема сохранена на телефоне.", "התקלה נשמרה בטלפון.")}</Text>
            </View>
          ) : null}
          {routeProjectMissing ? (
            <RouteNotice
              icon="alert-circle-outline"
              tone="warning"
              text={lt(
                `Project ${routeParams.projectId} is not available on this phone. Another project was not opened automatically.`,
                `Объект ${routeParams.projectId} недоступен на этом телефоне. Другой объект не был открыт автоматически.`,
                `הפרויקט ${routeParams.projectId} אינו זמין במכשיר הזה. פרויקט אחר לא נפתח אוטומטית.`
              )}
              actionLabel={lt("Show all issues", "Показать все проблемы", "הצג את כל התקלות")}
              onAction={() => router.replace("/issues" as never)}
            />
          ) : null}
          {routeDoorMissing ? (
            <RouteNotice
              icon="alert-circle-outline"
              tone="warning"
              text={lt(
                `Door ${routeParams.doorId} is not available for this issue context. Another door was not selected automatically.`,
                `Дверь ${routeParams.doorId} недоступна в этом контексте. Другая дверь не была выбрана автоматически.`,
                `הדלת ${routeParams.doorId} אינה זמינה בהקשר הזה. דלת אחרת לא נבחרה אוטומטית.`
              )}
              actionLabel={lt("Show all issues", "Показать все проблемы", "הצג את כל התקלות")}
              onAction={() => router.replace("/issues" as never)}
            />
          ) : null}
          {routeIssueMissing ? (
            <RouteNotice
              icon="alert-circle-outline"
              tone="warning"
              text={lt(
                `Issue ${routeParams.issueId} is not available on this phone. Another issue was not opened automatically.`,
                `Проблема ${routeParams.issueId} недоступна на этом телефоне. Другая проблема не была открыта автоматически.`,
                `התקלה ${routeParams.issueId} אינה זמינה במכשיר הזה. תקלה אחרת לא נפתחה אוטומטית.`
              )}
              actionLabel={lt("Show all issues", "Показать все проблемы", "הצג את כל התקלות")}
              onAction={() => router.replace("/issues" as never)}
            />
          ) : null}
          {routeProjectActive || routeIssueActive ? (
            <RouteNotice
              icon="filter-outline"
              tone="info"
              text={
                routeIssueActive
                  ? lt(
                      "Selected issue",
                      "Выбранная проблема",
                      "התקלה שנבחרה"
                    )
                  : lt(
                      `Project: ${projects.find((project) => project.id === routeParams.projectId)?.name || ""}`,
                      `Объект: ${projects.find((project) => project.id === routeParams.projectId)?.name || ""}`,
                      `פרויקט: ${projects.find((project) => project.id === routeParams.projectId)?.name || ""}`
                    )
              }
              actionLabel={lt("Show all issues", "Показать все проблемы", "הצג את כל התקלות")}
              onAction={() => router.replace("/issues" as never)}
            />
          ) : null}

          {composerOpen && loaded && !routeProjectMissing && !routeDoorMissing ? (
            <IssueDialog locale={locale} label={lt("New issue", "Новая проблема", "תקלה חדשה")} onClose={closeComposer} busy={busy}>
              <View style={styles.composerTop}>
                <View style={styles.issueBody}>
                  <Text style={styles.composerEyebrow}>{lt("NEW ISSUE", "НОВАЯ ПРОБЛЕМА", "תקלה חדשה")}</Text>
                  <Text style={styles.composerTitle}>
                    {step === "CATEGORY"
                      ? lt("Choose category", "Выберите категорию", "בחר קטגוריה")
                      : step === "DETAILS"
                        ? lt("Add details", "Добавьте детали", "הוסף פרטים")
                        : lt("Review and save", "Проверьте и сохраните", "בדוק ושמור")}
                  </Text>
                </View>
                <IconButton icon="close" label={lt("Close", "Закрыть", "סגור")} disabled={busy} onPress={closeComposer} />
              </View>
              <View style={styles.stepRow}>
                {(["CATEGORY", "DETAILS", "REVIEW"] as const).map((item, index) => {
                  const active = item === step;
                  const completed =
                    (step === "DETAILS" && index === 0) ||
                    (step === "REVIEW" && index < 2);
                  return (
                    <View key={item} style={styles.stepItem}>
                      <View style={[styles.stepCircle, active && styles.stepCircleActive, completed && styles.stepCircleDone]}>
                        <Text style={[styles.stepText, (active || completed) && styles.stepTextActive]}>{completed ? "✓" : index + 1}</Text>
                      </View>
                      {index < 2 ? <View style={styles.stepLine} /> : null}
                    </View>
                  );
                })}
              </View>

              {step === "CATEGORY" ? (
                <>
                  <Text style={styles.fieldLabel}>{lt("Project", "Объект", "אתר")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {projects.map((project) => (
                      <Pressable
                        key={project.id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: projectId === project.id }}
                        accessibilityLabel={project.name}
                        disabled={busy} onPress={() => { setProjectId(project.id); setDoorId(""); }}
                        style={[styles.chip, projectId === project.id && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, projectId === project.id && styles.chipTextActive]} >{project.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.fieldLabel}>{lt("Door", "Дверь", "דלת")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {projectDoors.map((door) => (
                      <Pressable
                        key={door.id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: doorId === door.id }}
                        accessibilityLabel={door.unit_label}
                        disabled={busy} onPress={() => setDoorId(door.id)}
                        style={[styles.chip, doorId === door.id && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, doorId === door.id && styles.chipTextActive]}>{door.unit_label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.fieldLabel}>{lt("What happened?", "Что произошло?", "מה קרה?")}</Text>
                  <View style={styles.categoryList}>
                    {categories.map((item) => {
                      const active = category === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${item.title}. ${item.hint}`}
                          disabled={busy} onPress={() => setCategory(item.id)}
                          style={[styles.category, active && styles.categoryActive]}
                        >
                          <View style={[styles.categoryIcon, active && styles.categoryIconActive]}>
                            <Ionicons name={CATEGORY_ICONS[item.id as keyof typeof CATEGORY_ICONS]} size={19} color={active ? installerTheme.background : installerTheme.textMuted} />
                          </View>
                          <View style={styles.categoryBody}>
                            <Text style={styles.categoryTitle}>{item.title}</Text>
                            <Text style={styles.categoryHint}>{item.hint}</Text>
                          </View>
                          {active ? <Ionicons name="checkmark-circle" size={20} color={installerTheme.successFill} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  <ActionButton
                    label={lt("Add details", "Добавить детали", "הוסף פרטים")}
                    icon={locale === "he" ? "arrow-back" : "arrow-forward"}
                    disabled={!canSave || busy}
                    onPress={() => setStep("DETAILS")}
                  />
                </>
              ) : null}

              {step === "DETAILS" ? (
                <>
                  <View style={styles.contextBox}>
                    <Text style={styles.contextTitle}>{selectedProject?.name}</Text>
                    <Text style={styles.contextMeta}>{selectedDoor?.unit_label} · {selectedCategory?.title}</Text>
                  </View>
                  <Text style={styles.fieldLabel}>{lt("Description", "Описание", "תיאור")}</Text>
                  <TextInput
                    accessibilityLabel={lt("Issue description", "Описание проблемы", "תיאור התקלה")}
                    editable={!busy}
                    value={details}
                    onChangeText={setDetails}
                    placeholder={lt("What should the office know?", "Что должен знать офис?", "מה המשרד צריך לדעת?")}
                    placeholderTextColor={installerTheme.textFaint}
                    multiline
                    maxLength={2000}
                    style={styles.textarea}
                  />
                  <Text style={[styles.charCount, { textAlign: isRTL ? "left" : "right" }]}>{details.length}/2000</Text>
                  <View style={styles.actionRow}>
                    <ActionButton label={lt("Back", "Назад", "חזרה")} icon={locale === "he" ? "arrow-forward" : "arrow-back"} variant="secondary" style={styles.flex} disabled={busy} onPress={() => setStep("CATEGORY")} />
                    <ActionButton label={lt("Review", "Проверить", "בדיקה")} icon={locale === "he" ? "arrow-back" : "arrow-forward"} style={styles.flex} disabled={!canSave || busy} onPress={() => setStep("REVIEW")} />
                  </View>
                </>
              ) : null}

              {step === "REVIEW" ? (
                <>
                  <View style={styles.reviewBox}>
                    <StatusPill label={lt("Ready to save", "Готово к сохранению", "מוכן לשמירה")} tone="success" icon="checkmark-circle-outline" />
                    <Text style={styles.reviewTitle}>{selectedCategory?.title}</Text>
                    <Text style={styles.reviewMeta}>{selectedProject?.name} · {selectedDoor?.unit_label}</Text>
                    <Text style={styles.reviewDetails}>{details || lt("No additional description.", "Без дополнительного описания.", "ללא תיאור נוסף.")}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="cloud-offline-outline" size={18} color={installerTheme.info} />
                    <Text style={styles.infoText}>{lt("Saved locally first, then synced automatically.", "Сначала сохраняется на телефоне, затем синхронизируется.", "נשמר קודם במכשיר ואז מסתנכרן.")}</Text>
                  </View>
                  {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
                  {error ? <Text style={styles.errorText} accessibilityLiveRegion="assertive">{error}</Text> : null}
                  <View style={styles.actionRow}>
                    <ActionButton label={lt("Back", "Назад", "חזרה")} icon={locale === "he" ? "arrow-forward" : "arrow-back"} variant="secondary" style={styles.flex} disabled={busy} onPress={() => setStep("DETAILS")} />
                    <ActionButton label={lt("Save issue", "Сохранить проблему", "שמור תקלה")} icon="checkmark" style={styles.flex} loading={busy} disabled={!canSave || busy} onPress={() => void queueIssue()} />
                  </View>
                </>
              ) : null}
            </IssueDialog>
          ) : null}

          {loaded ? <>
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "OPEN", label: lt("Open", "Открытые", "פתוחות"), count: openCount },
              { value: "ALL", label: lt("All", "Все", "הכול"), count: scopedIssues.length },
            ]}
          />

          <View style={styles.searchField}>
            <Ionicons name="search-outline" size={18} color={installerTheme.textMuted} />
            <TextInput accessibilityLabel={lt("Search issues", "Поиск проблем", "חיפוש תקלות")} value={search} onChangeText={setSearch} placeholder={lt("Project, door or description", "Объект, дверь или описание", "פרויקט, דלת או תיאור")} placeholderTextColor={installerTheme.textFaint} style={styles.searchInput} />
          </View>
          <SectionHeader title={lt("Assigned project issues", "Проблемы назначенных объектов", "תקלות בפרויקטים שהוקצו")} meta={visibleIssues.length} />
          {visibleIssues.length ? visibleIssues.map(({ issue, project, door }) => (
            <Reveal key={issue.id}>
              <SectionCard style={styles.issueCard}>
                <View pointerEvents="none" style={[styles.issueStrip, { backgroundColor: issue.status === "CLOSED" ? installerTheme.success : installerTheme.danger }]} />
                <Pressable accessibilityRole="button" accessibilityLabel={`${issue.title || lt("Reported issue", "Заявленная проблема", "תקלה שדווחה")}. ${project.name}. ${door?.unit_label || ""}`} onPress={() => setSelectedIssueId(issue.id)} style={styles.issueMain}>
                  <View style={styles.issueHeading}>
                    <View style={[styles.issueIcon, issue.status === "CLOSED" && styles.resolvedIcon]}><Ionicons name={issue.status === "CLOSED" ? "checkmark-circle-outline" : "alert-circle-outline"} size={21} color={issue.status === "CLOSED" ? installerTheme.success : installerTheme.danger} /></View>
                    <Text style={styles.issueTitle}>{issue.title || lt("Reported issue", "Заявленная проблема", "תקלה שדווחה")}</Text>
                    <DirectionalChevron size={18} color={installerTheme.textMuted} />
                  </View>
                  <Text style={styles.issueMeta}>{project.name}</Text>
                  <Text style={styles.doorLabel}>{door?.unit_label || lt("Door unavailable", "Дверь недоступна", "הדלת אינה זמינה")}</Text>
                  <View style={styles.summaryRow}>
                    <StatusPill label={translateEnum(locale, issue.status)} tone={issue.status === "CLOSED" ? "success" : "danger"} />
                    {issue.id.startsWith("local:") ? <StatusPill label={lt("On this phone", "На телефоне", "בטלפון")} tone="warning" icon="cloud-upload-outline" /> : null}
                  </View>
                  {issue.details ? <Text style={styles.issueDetails} numberOfLines={2}>{issue.details}</Text> : null}
                </Pressable>
              </SectionCard>
            </Reveal>
          )) : <EmptyState icon={search ? "search-outline" : "checkmark-circle-outline"}
            title={search ? lt("No matching issues", "Проблемы не найдены", "לא נמצאו תקלות") : routeProjectMissing || routeIssueMissing ? lt("Requested data unavailable", "Запрошенные данные недоступны", "הנתונים המבוקשים אינם זמינים") : filter === "OPEN" ? lt("No open issues", "Открытых проблем нет", "אין תקלות פתוחות") : lt("No reported issues", "Проблем пока нет", "אין תקלות שדווחו")}
            action={search ? <ActionButton label={lt("Clear search", "Очистить поиск", "ניקוי החיפוש")} icon="close" variant="secondary" onPress={() => setSearch("")} /> : undefined}
          />}
          </> : null}
        </View>
      </ScrollView>
      <InstallerBottomNav />
      {selectedIssue ? <IssueDialog locale={locale} label={lt("Issue details", "Детали проблемы", "פרטי התקלה")} onClose={() => setSelectedIssueId(null)}>
        <View style={styles.composerTop}>
          <StatusPill label={translateEnum(locale, selectedIssue.issue.status)} tone={selectedIssue.issue.status === "CLOSED" ? "success" : "danger"} />
          <IconButton icon="close" label={lt("Close issue details", "Закрыть детали проблемы", "סגירת פרטי התקלה")} onPress={() => setSelectedIssueId(null)} />
        </View>
        <Text style={styles.detailTitle}>{selectedIssue.issue.title || lt("Reported issue", "Заявленная проблема", "תקלה שדווחה")}</Text>
        <Text style={styles.fieldLabel}>{lt("Project", "Объект", "פרויקט")}</Text>
        <Text style={styles.contextTitle}>{selectedIssue.project.name}</Text>
        <Text style={styles.fieldLabel}>{lt("Door", "Дверь", "דלת")}</Text>
        <Text style={styles.doorLabel}>{selectedIssue.door?.unit_label || lt("Door unavailable", "Дверь недоступна", "הדלת אינה זמינה")}</Text>
        <Text style={styles.fieldLabel}>{lt("Description", "Описание", "תיאור")}</Text>
        <Text style={styles.detailBody}>{selectedIssue.issue.details || lt("No additional description.", "Без дополнительного описания.", "ללא תיאור נוסף.")}</Text>
        {selectedIssue.issue.id.startsWith("local:") ? <StatusPill label={lt("Saved on this phone", "Сохранено на телефоне", "נשמר בטלפון")} tone="warning" icon="cloud-upload-outline" /> : null}
        <View style={styles.summaryRow}>
          {selectedIssue.issue.source === "SITE" ? <StatusPill label={lt("Raised by the site", "От представителя объекта", "מטעם האתר")} tone="danger" icon="business-outline" /> : null}
          {selectedIssue.issue.stage_code ? <StatusPill label={`${lt("Stage", "Этап", "שלב")} ${selectedIssue.issue.stage_code}`} tone="warning" /> : null}
          {selectedIssue.issue.status !== "CLOSED" && selectedIssue.issue.workflow_state === "RESOLVED" ? <StatusPill label={translateEnum(locale, "RESOLVED")} tone="success" icon="checkmark-done-outline" /> : null}
        </View>
        {selectedIssue.issue.status !== "CLOSED" && selectedIssue.issue.workflow_state !== "RESOLVED" && !selectedIssue.issue.id.startsWith("local:") && selectedIssue.door ? (
          <ActionButton testID="issue-report-fixed" label={lt("Fixed, please check", "Исправлено, проверьте", "תוקן, נא לבדוק")} icon="checkmark-done-outline" loading={busy} disabled={busy}
            onPress={() => void (async () => {
              setBusy(true); setError(null);
              try {
                await reportIssueFixed({ projectId: selectedIssue.project.id, issueId: selectedIssue.issue.id, doorId: selectedIssue.door!.id });
                await reload();
              } catch (reason) {
                setError(reason instanceof Error ? localizeWorkflowMessage(reason.message, locale) : lt("Action failed. Please try again.", "Действие не выполнено. Попробуйте ещё раз.", "הפעולה נכשלה. נסו שוב."));
              } finally { setBusy(false); }
            })()} />
        ) : null}
        {selectedIssue.issue.source === "SITE" ? <Text style={styles.issueMeta}>{lt("The site representative confirms the fix.", "Исправление подтверждает представитель объекта.", "נציג האתר מאשר את התיקון.")}</Text>
          : selectedIssue.issue.status !== "CLOSED" ? <Text style={styles.issueMeta}>{lt("The office confirms the fix.", "Исправление подтверждает офис.", "המשרד מאשר את התיקון.")}</Text> : null}
        {error ? <Text style={styles.issueMeta}>{error}</Text> : null}
        <ActionButton label={selectedIssue.door ? lt("Open linked door", "Открыть эту дверь", "פתיחת הדלת המקושרת") : lt("Open project", "Открыть объект", "פתיחת הפרויקט")} icon="business-outline" variant="secondary" onPress={() => {
          const route = selectedIssue.door ? buildDoorProjectRoute(selectedIssue.project.id, selectedIssue.door.id) : buildProjectRoute(selectedIssue.project.id);
          setSelectedIssueId(null); router.push(route as never);
        }} />
      </IssueDialog> : null}
    </SafeAreaView>
  );
}

function IssueDialog({ locale, label, busy = false, onClose, children }: {
  locale: string; label: string; busy?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  return <Modal visible transparent statusBarTranslucent animationType={reducedMotion ? "none" : "fade"} onRequestClose={onClose}>
    <SafeAreaView style={[styles.modalRoot, { direction: locale === "he" ? "rtl" : "ltr" }]} edges={["top", "bottom", "left", "right"]}>
      <Pressable feedback="none" accessibilityRole="button" accessibilityLabel={locale === "ru" ? "Закрыть окно" : locale === "he" ? "סגירת החלון" : "Dismiss dialog"} disabled={busy} onPress={onClose} style={styles.modalBackdrop} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalPanel}>
        <View accessibilityViewIsModal accessibilityLabel={label} onAccessibilityEscape={onClose} style={styles.modalInner}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody} style={styles.modalScroll}>
            <Reveal>{children}</Reveal>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

function RouteNotice({
  icon,
  tone,
  text,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tone: "warning" | "info";
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const color = tone === "warning" ? installerTheme.warning : installerTheme.info;
  return (
    <View style={[styles.routeNotice, tone === "info" && styles.routeNoticeInfo]}>
      <Ionicons name={icon} size={18} color={color} />
      <View style={styles.routeNoticeBody}>
        <Text style={[styles.routeNoticeText, tone === "info" && styles.routeNoticeTextInfo]}>
          {text}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.routeNoticeAction, pressed && styles.pressed]}
        >
          <Text style={styles.routeNoticeActionText}>{actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  content: { flex: 1 },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  header: { padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: installerTheme.border },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heading: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 23, lineHeight: 31 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  loadError: { gap: 8 },
  searchField: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, paddingHorizontal: 12, borderRadius: installerTheme.radius.md, borderWidth: 1, borderColor: installerTheme.borderStrong, backgroundColor: installerTheme.shellRaised },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 10, color: installerTheme.text, fontFamily: installerTheme.fontFamily, fontSize: 13 },
  issueCard: { padding: 0, overflow: "hidden", borderColor: installerTheme.borderStrong },
  issueMain: { padding: 16, gap: 9 },
  issueStrip: { position: "absolute", top: 0, bottom: 0, start: 0, width: 3 },
  issueHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  resolvedIcon: { backgroundColor: installerTheme.successSoft },
  doorLabel: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyMono, fontSize: 13, lineHeight: 20 },
  detailTitle: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 20, lineHeight: 28, marginTop: 12 },
  detailBody: { color: installerTheme.text, fontSize: 14, lineHeight: 22, marginBottom: 20 },
  modalRoot: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
  modalPanel: { width: "100%", maxWidth: 480, maxHeight: "92%", flexShrink: 1, borderWidth: 1, borderColor: installerTheme.borderStrong, borderRadius: installerTheme.radius.card, backgroundColor: installerTheme.shellRaised, overflow: "hidden" },
  modalInner: { flexShrink: 1 },
  modalScroll: { flexShrink: 1 },
  modalBody: { padding: 16 },
  body: { gap: 14, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.successBorder,
    backgroundColor: installerTheme.successSoft,
    padding: 11,
  },
  successText: { flex: 1, color: installerTheme.success, fontSize: installerTheme.type.caption, fontWeight: "700" },
  routeNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.warningBorder,
    backgroundColor: installerTheme.warningSoft,
    padding: 11,
  },
  routeNoticeInfo: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.infoSoft },
  routeNoticeBody: { flex: 1, minWidth: 0, gap: 8 },
  routeNoticeText: { color: installerTheme.warning, fontSize: installerTheme.type.caption, lineHeight: 16 },
  routeNoticeTextInfo: { color: installerTheme.info },
  routeNoticeAction: {
    alignSelf: "flex-start",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  routeNoticeActionText: { color: installerTheme.text, fontSize: 12, fontWeight: "800" },
  composerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  composerEyebrow: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, fontWeight: "800" },
  composerTitle: { color: installerTheme.text, fontSize: 18, fontWeight: "800", marginTop: 3 },
  stepRow: { flexDirection: "row", marginVertical: 18, paddingHorizontal: 4 },
  stepItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepCircle: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.borderStrong,
    backgroundColor: installerTheme.card,
  },
  stepCircleActive: { borderColor: installerTheme.accent, backgroundColor: installerTheme.accent },
  stepCircleDone: { borderColor: installerTheme.successFill, backgroundColor: installerTheme.successFill },
  stepText: { color: installerTheme.textMuted, fontSize: 12, fontWeight: "800" },
  stepTextActive: { color: installerTheme.background },
  stepLine: { flex: 1, height: 1, backgroundColor: installerTheme.border, marginHorizontal: 5 },
  fieldLabel: { color: installerTheme.textMuted, fontSize: 12, fontWeight: "800", marginTop: 12, marginBottom: 7, textTransform: "uppercase" },
  chips: { gap: 7, paddingEnd: 12 },
  chip: {
    maxWidth: 240,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { borderColor: installerTheme.infoBorder, backgroundColor: installerTheme.primarySoft },
  chipText: { color: installerTheme.textMuted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: installerTheme.info },
  categoryList: { gap: 7, marginBottom: 14 },
  category: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.cardMuted,
    padding: 10,
  },
  categoryActive: { borderColor: installerTheme.accentEdge, backgroundColor: installerTheme.accentWarm },
  categoryIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.md,
    backgroundColor: installerTheme.background,
  },
  categoryIconActive: { backgroundColor: installerTheme.accent },
  categoryBody: { flex: 1, minWidth: 0 },
  categoryTitle: { color: installerTheme.text, fontSize: 14, fontWeight: "800" },
  categoryHint: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  contextBox: { borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: installerTheme.border, backgroundColor: installerTheme.shellRaised, padding: 12 },
  contextTitle: { color: installerTheme.text, fontSize: 13, fontWeight: "800" },
  contextMeta: { color: installerTheme.textMuted, fontSize: 12, marginTop: 3 },
  textarea: {
    minHeight: 130,
    textAlignVertical: "top",
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.cardMuted,
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  charCount: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  flex: { flex: 1 },
  reviewBox: { gap: 8, borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: installerTheme.border, backgroundColor: installerTheme.cardMuted, padding: 13 },
  reviewTitle: { color: installerTheme.text, fontSize: 16, fontWeight: "800" },
  reviewMeta: { color: installerTheme.textMuted, fontSize: 12 },
  reviewDetails: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18 },
  infoRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 12 },
  infoText: { flex: 1, color: installerTheme.info, fontSize: 12, lineHeight: 15 },
  errorText: { color: installerTheme.danger, fontSize: installerTheme.type.caption, marginTop: 10 },
  issueIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.dangerSoft },
  issueBody: { flex: 1, minWidth: 0 },
  issueTitle: { flex: 1, color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 15, lineHeight: 22 },
  issueMeta: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18 },
  issueDetails: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  pressed: { opacity: 0.68 },
});
