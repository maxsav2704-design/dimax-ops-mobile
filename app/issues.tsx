import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { installerTheme } from "@/lib/theme";
import { translateEnum } from "@/lib/i18n";
import {
  filterIssueScopesForRoute,
  isIssueRouteDoorMissing,
  isIssueRouteIssueMissing,
  isIssueRouteProjectMissing,
  resolveIssueRouteParams,
} from "@/modules/issues/presentation";
import { buildProjectRoute } from "@/modules/projects/navigation";
import {
  listProjectDoors,
  listProjectIssues,
  listProjects,
} from "@/modules/projects/repository";
import type { InstallerDoor, ProjectIssue, ProjectListItem } from "@/modules/projects/types";
import {
  getSyncQueueSummary,
  queueIssueCreateEvent,
  runSync,
} from "@/modules/sync/service";
import { useI18n } from "@/providers/AppProviders";

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
  const { locale } = useI18n();
  const params = useLocalSearchParams<{
    projectId?: string;
    project_id?: string;
    doorId?: string;
    door_id?: string;
    issueId?: string;
    issue_id?: string;
    compose?: string;
  }>();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [doors, setDoors] = useState<InstallerDoor[]>([]);
  const [issues, setIssues] = useState<IssueScope[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<IssueFilter>("OPEN");
  const [composerOpen, setComposerOpen] = useState(false);
  const [step, setStep] = useState<ComposerStep>("CATEGORY");
  const [projectId, setProjectId] = useState("");
  const [doorId, setDoorId] = useState("");
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [queueCount, setQueueCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);

  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const routeParams = resolveIssueRouteParams(params);
  const categories = [
    { id: "defective", title: lt("Defective part", "Дефект детали", "חלק פגום"), hint: lt("crack, bend, broken hardware", "трещина, изгиб, поломка", "סדק, עיקום או שבר") },
    { id: "missing", title: lt("Missing or wrong item", "Нет детали или не та комплектация", "פריט חסר או שגוי"), hint: lt("part, key or specification", "деталь, ключ или спецификация", "חלק, מפתח או מפרט") },
    { id: "access", title: lt("Access problem", "Проблема доступа", "בעיית גישה"), hint: lt("locked area, code or client access", "закрытая зона, код или доступ", "אזור נעול, קוד או גישה") },
    { id: "blocked", title: lt("Site is not ready", "Объект не готов", "האתר לא מוכן"), hint: lt("opening, power or other work blocks install", "проём, электричество или другие работы мешают", "פתח, חשמל או עבודה אחרת חוסמים") },
    { id: "mismatch", title: lt("Specification mismatch", "Несоответствие спецификации", "אי התאמה למפרט"), hint: lt("size, type, marking or configuration", "размер, тип, маркировка или конфигурация", "מידה, סוג, סימון או תצורה") },
    { id: "other", title: lt("Something else", "Другая проблема", "בעיה אחרת"), hint: lt("describe it in your own words", "опишите своими словами", "תאר במילים שלך") },
  ];

  const reload = async () => {
    const projectRows = await listProjects();
    const projectData = await Promise.all(
      projectRows.map(async (project) => {
        const [doorRows, issueRows] = await Promise.all([
          listProjectDoors(project.id),
          listProjectIssues(project.id),
        ]);
        return { project, doorRows, issueRows };
      })
    );
    const allDoors = projectData.flatMap((item) => item.doorRows);
    const scopes = projectData.flatMap((item) =>
      item.issueRows.map((issue) => ({
        issue,
        project: item.project,
        door: item.doorRows.find((door) => door.id === issue.door_id) || null,
      }))
    );
    setProjects(projectRows);
    setDoors(allDoors);
    setIssues(scopes);
    const queue = await getSyncQueueSummary();
    setQueueCount(queue.total);
    setLoaded(true);
    if (!projectId && projectRows[0]) {
      setProjectId(projectRows[0].id);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (routeParams.projectId) {
      setProjectId(routeParams.projectId);
    }
    if (routeParams.doorId) {
      setDoorId(routeParams.doorId);
    }
    if (routeParams.compose) {
      setComposerOpen(true);
    }
  }, [routeParams.compose, routeParams.doorId, routeParams.projectId]);

  useEffect(() => {
    if (!projectId) {
      if (doorId) {
        setDoorId("");
      }
      return;
    }
    const firstDoor = doors.find((door) => door.project_id === projectId);
    const doorMatches = doors.some(
      (door) => door.id === doorId && door.project_id === projectId,
    );
    if (doorMatches) {
      return;
    }
    const shouldRespectRequestedDoor = Boolean(
      routeParams.doorId &&
        (!routeParams.projectId || projectId === routeParams.projectId),
    );
    if (shouldRespectRequestedDoor && loaded) {
      if (doorId) {
        setDoorId("");
      }
      return;
    }
    setDoorId(firstDoor?.id || "");
  }, [
    doorId,
    doors,
    loaded,
    projectId,
    routeParams.doorId,
    routeParams.projectId,
  ]);

  const selectedProject = projects.find((project) => project.id === projectId) || null;
  const selectedDoor = doors.find((door) => door.id === doorId) || null;
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
  const visibleIssues = useMemo(
    () => {
      if (routeProjectMissing) {
        return [];
      }
      return filterIssueScopesForRoute(issues, {
        projectId: routeProjectMissing ? "" : routeParams.projectId,
        issueId: routeParams.issueId,
        statusFilter: filter,
      });
    },
    [filter, issues, routeParams.issueId, routeParams.projectId, routeProjectMissing]
  );
  const openCount = issues.filter((item) => item.issue.status !== "CLOSED").length;

  const resetComposer = () => {
    setComposerOpen(false);
    setStep("CATEGORY");
    setCategory("");
    setDetails("");
    setError(null);
  };

  const queueIssue = async () => {
    if (!selectedProject || !selectedDoor || !selectedCategory) {
      return;
    }
    setBusy(true);
    setError(null);
    setQueuedMessage(null);
    try {
      await queueIssueCreateEvent({
        projectId: selectedProject.id,
        doorId: selectedDoor.id,
        title: selectedCategory.title,
        details,
      });
      try {
        await runSync({ forceRetry: true });
      } catch {
        // The issue remains in the durable local outbox and is visible immediately.
      }
      await reload();
      setQueuedMessage(
        lt(
          "Issue saved. It will sync automatically.",
          "Проблема сохранена и синхронизируется автоматически.",
          "התקלה נשמרה ותסתנכרן אוטומטית."
        )
      );
      resetComposer();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Unable to save issue", "Не удалось сохранить проблему", "לא ניתן לשמור את התקלה"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          eyebrow={lt("FIELD ISSUES", "ПРОБЛЕМЫ НА ОБЪЕКТЕ", "תקלות בשטח")}
          title={lt("Issues", "Проблемы", "תקלות")}
          subtitle={lt(
            `${openCount} open · ${queueCount} actions in sync queue`,
            `Открыто: ${openCount} · в очереди синка: ${queueCount}`,
            `${openCount} פתוחות · ${queueCount} פעולות בתור`
          )}
          right={
            <IconButton
              icon="cloud-upload-outline"
              label={lt("Open sync queue", "Открыть очередь синка", "פתח תור סנכרון")}
              tone="dark"
              onPress={() => router.push("/sync-queue" as never)}
            />
          }
        >
          <ActionButton
            label={lt("Flag a new issue", "Сообщить о проблеме", "דווח על תקלה")}
            icon="add"
            style={styles.heroButton}
            onPress={() => setComposerOpen(true)}
          />
        </ScreenHero>

        <View style={styles.body}>
          {queuedMessage ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={18} color={installerTheme.success} />
              <Text style={styles.successText}>{queuedMessage}</Text>
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
                      `Focused issue ${routeParams.issueId}`,
                      `Фокус по проблеме ${routeParams.issueId}`,
                      `מיקוד תקלה ${routeParams.issueId}`
                    )
                  : lt(
                      `Focused project ${routeParams.projectId}`,
                      `Фокус по объекту ${routeParams.projectId}`,
                      `מיקוד פרויקט ${routeParams.projectId}`
                    )
              }
              actionLabel={lt("Show all issues", "Показать все проблемы", "הצג את כל התקלות")}
              onAction={() => router.replace("/issues" as never)}
            />
          ) : null}

          {composerOpen ? (
            <SectionCard>
              <View style={styles.composerTop}>
                <View>
                  <Text style={styles.composerEyebrow}>{lt("NEW ISSUE", "НОВАЯ ПРОБЛЕМА", "תקלה חדשה")}</Text>
                  <Text style={styles.composerTitle}>
                    {step === "CATEGORY"
                      ? lt("Choose category", "Выберите категорию", "בחר קטגוריה")
                      : step === "DETAILS"
                        ? lt("Add details", "Добавьте детали", "הוסף פרטים")
                        : lt("Review and save", "Проверьте и сохраните", "בדוק ושמור")}
                  </Text>
                </View>
                <IconButton icon="close" label={lt("Close", "Закрыть", "סגור")} onPress={resetComposer} />
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
                        onPress={() => setProjectId(project.id)}
                        style={[styles.chip, projectId === project.id && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, projectId === project.id && styles.chipTextActive]} numberOfLines={1}>{project.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.fieldLabel}>{lt("Door", "Дверь", "דלת")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {projectDoors.map((door) => (
                      <Pressable
                        key={door.id}
                        onPress={() => setDoorId(door.id)}
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
                          onPress={() => setCategory(item.id)}
                          style={[styles.category, active && styles.categoryActive]}
                        >
                          <View style={[styles.categoryIcon, active && styles.categoryIconActive]}>
                            <Ionicons name={CATEGORY_ICONS[item.id as keyof typeof CATEGORY_ICONS]} size={19} color={active ? installerTheme.text : installerTheme.textMuted} />
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
                    icon="arrow-forward"
                    disabled={!selectedProject || !selectedDoor || !selectedCategory}
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
                    value={details}
                    onChangeText={setDetails}
                    placeholder={lt("What should the office know?", "Что должен знать офис?", "מה המשרד צריך לדעת?")}
                    placeholderTextColor={installerTheme.textFaint}
                    multiline
                    maxLength={2000}
                    style={styles.textarea}
                  />
                  <Text style={styles.charCount}>{details.length}/2000</Text>
                  <Text style={styles.optionalNote}>
                    {lt(
                      "Photo confirmation is optional. The issue can be saved without it.",
                      "Фото необязательно. Проблему можно сохранить без него.",
                      "צילום אינו חובה. אפשר לשמור את התקלה בלעדיו."
                    )}
                  </Text>
                  <View style={styles.actionRow}>
                    <ActionButton label={lt("Back", "Назад", "חזרה")} icon="arrow-back" variant="secondary" style={styles.flex} onPress={() => setStep("CATEGORY")} />
                    <ActionButton label={lt("Review", "Проверить", "בדיקה")} icon="arrow-forward" style={styles.flex} onPress={() => setStep("REVIEW")} />
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
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <View style={styles.actionRow}>
                    <ActionButton label={lt("Back", "Назад", "חזרה")} icon="arrow-back" variant="secondary" style={styles.flex} onPress={() => setStep("DETAILS")} />
                    <ActionButton label={lt("Save issue", "Сохранить проблему", "שמור תקלה")} icon="checkmark" style={styles.flex} loading={busy} disabled={busy} onPress={() => void queueIssue()} />
                  </View>
                </>
              ) : null}
            </SectionCard>
          ) : null}

          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "OPEN", label: lt("Open", "Открытые", "פתוחות"), count: openCount },
              { value: "ALL", label: lt("All", "Все", "הכול"), count: issues.length },
            ]}
          />

          <SectionCard>
            <SectionHeader title={lt("My reported issues", "Мои проблемы", "התקלות שדיווחתי")} meta={visibleIssues.length} />
            {visibleIssues.length ? (
              <View style={styles.issueList}>
                {visibleIssues.map(({ issue, project, door }) => (
                  <Pressable
                    key={issue.id}
                    onPress={() => router.push(buildProjectRoute(project.id) as never)}
                    style={({ pressed }) => [styles.issueRow, pressed && styles.pressed]}
                  >
                    <View style={styles.issueIcon}>
                      <Ionicons name="alert-circle-outline" size={19} color={installerTheme.danger} />
                    </View>
                    <View style={styles.issueBody}>
                      <Text style={styles.issueTitle} numberOfLines={1}>{issue.title || lt("Reported issue", "Заявленная проблема", "תקלה שדווחה")}</Text>
                      <Text style={styles.issueMeta} numberOfLines={1}>{project.name} · {door?.unit_label || lt("Door", "Дверь", "דלת")}</Text>
                      {issue.details ? <Text style={styles.issueDetails} numberOfLines={2}>{issue.details}</Text> : null}
                    </View>
                    <StatusPill label={translateEnum(locale, issue.status)} tone={issue.status === "CLOSED" ? "success" : "danger"} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="checkmark-circle-outline"
                title={lt("No open issues", "Открытых проблем нет", "אין תקלות פתוחות")}
                description={lt("You can continue with the assigned doors.", "Можно продолжать работу с назначенными дверями.", "אפשר להמשיך לעבוד על הדלתות המשויכות.")}
              />
            )}
          </SectionCard>
        </View>
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
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
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  heroButton: { marginTop: 16 },
  body: { gap: 12, padding: 12 },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: "#B8E5C4",
    backgroundColor: installerTheme.successSoft,
    padding: 11,
  },
  successText: { flex: 1, color: installerTheme.success, fontSize: 11, fontWeight: "700" },
  routeNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: "#FFD4A3",
    backgroundColor: installerTheme.warningSoft,
    padding: 11,
  },
  routeNoticeInfo: { borderColor: "#B5D1F0", backgroundColor: installerTheme.infoSoft },
  routeNoticeBody: { flex: 1, minWidth: 0, gap: 8 },
  routeNoticeText: { color: installerTheme.warning, fontSize: 11, lineHeight: 16 },
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
  routeNoticeActionText: { color: installerTheme.text, fontSize: 10, fontWeight: "800" },
  composerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  composerEyebrow: { color: installerTheme.textMuted, fontSize: 9, fontWeight: "800" },
  composerTitle: { color: installerTheme.text, fontSize: 18, fontWeight: "800", marginTop: 3 },
  stepRow: { flexDirection: "row", marginVertical: 18, paddingHorizontal: 4 },
  stepItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepCircle: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: installerTheme.borderStrong,
    backgroundColor: installerTheme.card,
  },
  stepCircleActive: { borderColor: installerTheme.accent, backgroundColor: installerTheme.accent },
  stepCircleDone: { borderColor: installerTheme.successFill, backgroundColor: installerTheme.successFill },
  stepText: { color: installerTheme.textMuted, fontSize: 10, fontWeight: "800" },
  stepTextActive: { color: installerTheme.text },
  stepLine: { flex: 1, height: 1, backgroundColor: installerTheme.border, marginHorizontal: 5 },
  fieldLabel: { color: installerTheme.textMuted, fontSize: 10, fontWeight: "800", marginTop: 12, marginBottom: 7, textTransform: "uppercase" },
  chips: { gap: 7, paddingRight: 12 },
  chip: {
    maxWidth: 210,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
    paddingHorizontal: 12,
  },
  chipActive: { borderColor: installerTheme.primary, backgroundColor: installerTheme.primary },
  chipText: { color: installerTheme.textMuted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: installerTheme.textOnDark },
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
  categoryTitle: { color: installerTheme.text, fontSize: 12, fontWeight: "800" },
  categoryHint: { color: installerTheme.textMuted, fontSize: 9, lineHeight: 13, marginTop: 2 },
  contextBox: { borderRadius: installerTheme.radius.card, backgroundColor: installerTheme.background, padding: 12 },
  contextTitle: { color: installerTheme.text, fontSize: 13, fontWeight: "800" },
  contextMeta: { color: installerTheme.textMuted, fontSize: 10, marginTop: 3 },
  textarea: {
    minHeight: 130,
    textAlignVertical: "top",
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.cardMuted,
    color: installerTheme.text,
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  charCount: { color: installerTheme.textFaint, fontSize: 9, textAlign: "right", marginTop: 4 },
  optionalNote: { color: installerTheme.info, fontSize: 10, lineHeight: 15, marginVertical: 10 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  flex: { flex: 1 },
  reviewBox: { gap: 8, borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: installerTheme.border, backgroundColor: installerTheme.cardMuted, padding: 13 },
  reviewTitle: { color: installerTheme.text, fontSize: 16, fontWeight: "800" },
  reviewMeta: { color: installerTheme.textMuted, fontSize: 10 },
  reviewDetails: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18 },
  infoRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 12 },
  infoText: { flex: 1, color: installerTheme.info, fontSize: 10, lineHeight: 15 },
  errorText: { color: installerTheme.danger, fontSize: 11, marginTop: 10 },
  issueList: { marginTop: 8 },
  issueRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: installerTheme.border, paddingVertical: 10 },
  issueIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.md, backgroundColor: installerTheme.dangerSoft },
  issueBody: { flex: 1, minWidth: 0 },
  issueTitle: { color: installerTheme.text, fontSize: 12, fontWeight: "800" },
  issueMeta: { color: installerTheme.textMuted, fontSize: 9, marginTop: 2 },
  issueDetails: { color: installerTheme.textMuted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  pressed: { opacity: 0.68 },
});
