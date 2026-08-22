import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InstallerBottomNav } from "@/components/installer-ui";
import {
  ActionButton,
  BrandText as Text,
  EmptyState,
  ScreenHero,
  SectionCard,
  SectionHeader,
  SegmentedControl,
  StatusPill,
} from "@/components/mobile-ui";
import { installerTheme } from "@/lib/theme";
import {
  loadInstallerJournals,
  prepareInstallerJournal,
} from "@/modules/journal/service";
import type {
  InstallerJournalSummary,
  JournalStatus,
} from "@/modules/journal/types";
import { listProjectDoors, listProjects } from "@/modules/projects/repository";
import type { ProjectListItem } from "@/modules/projects/types";
import { useI18n } from "@/providers/AppProviders";

type JournalFilter = "ALL" | JournalStatus;

type JournalLane = {
  project: ProjectListItem;
  journal: InstallerJournalSummary | null;
  installedLocally: number;
};

function statusTone(status: JournalStatus | null) {
  if (status === "ARCHIVED") return "success" as const;
  if (status === "ACTIVE") return "info" as const;
  if (status === "DRAFT") return "warning" as const;
  return "neutral" as const;
}

export default function JournalScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [journals, setJournals] = useState<InstallerJournalSummary[]>([]);
  const [installedCounts, setInstalledCounts] = useState<
    Record<string, number>
  >({});
  const [filter, setFilter] = useState<JournalFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lt = (en: string, ru: string, he: string) =>
    locale === "ru" ? ru : locale === "he" ? he : en;

  const statusLabel = (status: JournalStatus | null) => {
    if (status === "ARCHIVED") return lt("Signed", "Подписан", "נחתם");
    if (status === "ACTIVE")
      return lt("Awaiting signature", "Ожидает подписи", "ממתין לחתימה");
    if (status === "DRAFT") return lt("Draft", "Черновик", "טיוטה");
    return lt("Not prepared", "Не сформирован", "טרם הוכן");
  };

  const reload = useCallback(async () => {
    setError(null);
    const projectRows = await listProjects();
    setProjects(projectRows);
    const localCounts = await Promise.all(
      projectRows.map(async (project) => {
        const doors = await listProjectDoors(project.id);
        return [
          project.id,
          doors.filter((door) => door.status === "INSTALLED").length,
        ] as const;
      }),
    );
    setInstalledCounts(Object.fromEntries(localCounts));
    try {
      const result = await loadInstallerJournals();
      setJournals(result.data);
      setNotice(
        result.source === "cache"
          ? lt(
              "Offline: showing the last saved journal.",
              "Офлайн: показан последний сохранённый журнал.",
              "לא מקוון: מוצג יומן העבודה האחרון שנשמר.",
            )
          : null,
      );
    } catch (reason) {
      setJournals([]);
      setNotice(
        lt(
          "Journal is unavailable offline until its first online load.",
          "Журнал появится офлайн после первой загрузки из сети.",
          "יומן העבודה יהיה זמין במצב לא מקוון לאחר טעינה ראשונה מהרשת.",
        ),
      );
      if (!projectRows.length) {
        setError(
          reason instanceof Error
            ? reason.message
            : lt(
                "Unable to load journal",
                "Не удалось загрузить журнал",
                "לא ניתן לטעון את היומן",
              ),
        );
      }
    }
  }, [locale]);

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, [reload]);

  const journalByProject = useMemo(
    () => new Map(journals.map((journal) => [journal.project_id, journal])),
    [journals],
  );
  const lanes = useMemo<JournalLane[]>(
    () =>
      projects
        .map((project) => ({
          project,
          journal: journalByProject.get(project.id) ?? null,
          installedLocally: installedCounts[project.id] ?? 0,
        }))
        .filter((lane) => filter === "ALL" || lane.journal?.status === filter)
        .sort((left, right) => {
          const rank = (value: JournalStatus | undefined) =>
            value === "ACTIVE"
              ? 0
              : value === "DRAFT"
                ? 1
                : value === "ARCHIVED"
                  ? 2
                  : 3;
          return (
            rank(left.journal?.status) - rank(right.journal?.status) ||
            left.project.name.localeCompare(right.project.name)
          );
        }),
    [filter, installedCounts, journalByProject, projects],
  );

  const counters = useMemo(
    () => ({
      all: projects.length,
      draft: journals.filter((item) => item.status === "DRAFT").length,
      active: journals.filter((item) => item.status === "ACTIVE").length,
      archived: journals.filter((item) => item.status === "ARCHIVED").length,
    }),
    [journals, projects.length],
  );

  const prepare = async (projectId: string) => {
    setBusyProjectId(projectId);
    setError(null);
    try {
      const journal = await prepareInstallerJournal(projectId);
      setJournals((current) => [
        journal,
        ...current.filter((item) => item.id !== journal.id),
      ]);
      router.push(`/journal/${journal.id}` as never);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : lt(
              "Unable to prepare document",
              "Не удалось сформировать акт",
              "לא ניתן להכין את המסמך",
            ),
      );
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={installerTheme.background}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void reload()}
            tintColor={installerTheme.accent}
          />
        }
      >
        <ScreenHero
          eyebrow={lt("COMPLETED WORK", "ЗАВЕРШЁННЫЕ РАБОТЫ", "עבודות שהושלמו")}
          title={lt("Work journal", "Журнал работ", "יומן עבודה")}
          subtitle={lt(
            "Acceptance documents by project, ready for the developer's signature.",
            "Акты по каждому объекту: от завершения работ до подписи застройщика.",
            "מסמכי מסירה לכל פרויקט, מסיום העבודה ועד חתימת היזם.",
          )}
        >
          <View style={styles.heroMetrics}>
            <View>
              <Text style={styles.heroMetricValue}>{counters.active}</Text>
              <Text style={styles.heroMetricLabel}>
                {lt("to sign", "на подписи", "לחתימה")}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View>
              <Text style={styles.heroMetricValue}>{counters.archived}</Text>
              <Text style={styles.heroMetricLabel}>
                {lt("signed", "подписано", "נחתמו")}
              </Text>
            </View>
          </View>
        </ScreenHero>

        {notice ? (
          <View style={styles.notice}>
            <Ionicons
              name="cloud-offline-outline"
              size={16}
              color={installerTheme.warning}
            />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.notice, styles.errorNotice]}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={installerTheme.danger}
            />
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        <SegmentedControl
          dark
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: "ALL",
              label: lt("All", "Все", "הכל"),
              count: counters.all,
            },
            {
              value: "DRAFT",
              label: lt("Drafts", "Черновики", "טיוטות"),
              count: counters.draft,
            },
            {
              value: "ACTIVE",
              label: lt("Signature", "Подпись", "חתימה"),
              count: counters.active,
            },
            {
              value: "ARCHIVED",
              label: lt("Archive", "Архив", "ארכיון"),
              count: counters.archived,
            },
          ]}
        />

        <SectionHeader
          title={lt("Projects", "Объекты", "פרויקטים")}
          meta={lanes.length}
        />
        {lanes.length ? (
          <View style={styles.list}>
            {lanes.map(({ project, journal, installedLocally }) => {
              const completed = journal
                ? journal.completed_doors + journal.completed_addons
                : installedLocally;
              return (
                <Pressable
                  key={project.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${project.name}. ${statusLabel(journal?.status ?? null)}`}
                  onPress={() =>
                    journal
                      ? router.push(`/journal/${journal.id}` as never)
                      : void prepare(project.id)
                  }
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <SectionCard style={styles.projectCard}>
                    <View
                      style={[
                        styles.statusRail,
                        {
                          backgroundColor:
                            journal?.status === "ARCHIVED"
                              ? installerTheme.success
                              : journal?.status === "ACTIVE"
                                ? installerTheme.info
                                : installerTheme.accent,
                        },
                      ]}
                    />
                    <View style={styles.cardHeader}>
                      <View style={styles.projectIcon}>
                        <Ionicons
                          name={
                            journal?.status === "ARCHIVED"
                              ? "shield-checkmark"
                              : "business-outline"
                          }
                          size={21}
                          color={installerTheme.accent}
                        />
                      </View>
                      <View style={styles.cardTitleWrap}>
                        <Text style={styles.projectName} numberOfLines={2}>
                          {project.name}
                        </Text>
                        <Text style={styles.projectAddress} numberOfLines={2}>
                          {project.address ||
                            lt(
                              "Address not specified",
                              "Адрес не указан",
                              "לא צוינה כתובת",
                            )}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={installerTheme.textFaint}
                      />
                    </View>
                    <View style={styles.cardMetaRow}>
                      <StatusPill
                        label={statusLabel(journal?.status ?? null)}
                        tone={statusTone(journal?.status ?? null)}
                      />
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedValue}>{completed}</Text>
                        <Text style={styles.completedLabel}>
                          {lt("completed", "завершено", "הושלמו")}
                        </Text>
                      </View>
                    </View>
                    {journal?.status === "ACTIVE" ? (
                      <Text style={styles.workflowHint}>
                        {lt(
                          "The developer's signature is pending",
                          "Ожидается подпись застройщика",
                          "ממתין לחתימת היזם",
                        )}
                      </Text>
                    ) : journal?.status === "ARCHIVED" ? (
                      <Text style={styles.workflowHint}>
                        {lt(
                          "Signed PDF is stored in the journal",
                          "Подписанный PDF сохранён в журнале",
                          "קובץ PDF חתום נשמר ביומן",
                        )}
                      </Text>
                    ) : null}
                    {!journal ? (
                      <ActionButton
                        label={lt(
                          "Prepare acceptance",
                          "Сформировать акт",
                          "הכנת מסמך מסירה",
                        )}
                        icon="document-text-outline"
                        variant="secondary"
                        loading={busyProjectId === project.id}
                        onPress={() => void prepare(project.id)}
                      />
                    ) : null}
                  </SectionCard>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <SectionCard>
            <EmptyState
              icon="document-text-outline"
              title={lt(
                "No documents in this filter",
                "В этом разделе нет актов",
                "אין מסמכים במסנן זה",
              )}
              description={lt(
                "Completed work will be grouped here by project.",
                "Завершённые работы будут собираться здесь по объектам.",
                "עבודות שהושלמו יקובצו כאן לפי פרויקט.",
              )}
            />
          </SectionCard>
        )}
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: installerTheme.background },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: installerTheme.layout.bottomNavClearance + 24,
    gap: 16,
  },
  heroMetrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 18,
  },
  heroMetricValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyDisplayStrong,
    fontSize: 25,
  },
  heroMetricLabel: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 34,
    backgroundColor: installerTheme.borderStrong,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: installerTheme.warningBorder,
    backgroundColor: installerTheme.warningSoft,
    borderRadius: installerTheme.radius.md,
    padding: 12,
  },
  errorNotice: {
    borderColor: installerTheme.dangerBorder,
    backgroundColor: installerTheme.dangerSoft,
  },
  noticeText: {
    flex: 1,
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  list: { gap: 12 },
  projectCard: { position: "relative", overflow: "hidden", gap: 14 },
  statusRail: { position: "absolute", top: 0, bottom: 0, start: 0, width: 3 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  projectIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: installerTheme.accentWarm,
    borderWidth: 1,
    borderColor: installerTheme.accentEdge,
  },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  projectName: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 16,
    lineHeight: 21,
  },
  projectAddress: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  completedBadge: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  completedValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyDisplayStrong,
    fontSize: 20,
  },
  completedLabel: {
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 10,
  },
  workflowHint: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    borderTopWidth: 1,
    borderTopColor: installerTheme.border,
    paddingTop: 12,
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
});
