import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { InstallerBottomNav } from "@/components/installer-ui";
import { ActionButton, BrandText as Text, EmptyState, IconButton, ScreenHero, SectionCard, SectionHeader, SegmentedControl, StatusPill } from "@/components/mobile-ui";
import { installerTheme } from "@/lib/theme";
import { prepareInstallerJournal } from "@/modules/journal/service";
import { loadJournalWorkspace } from "@/modules/journal/workspace";
import { journalGroups } from "@/modules/journal/presentation";
import { useJournalResource } from "@/modules/journal/use-journal-resource";
import type { JournalStatus } from "@/modules/journal/types";
import { buildProjectRoute } from "@/modules/projects/navigation";
import { useAuth, useI18n } from "@/providers/AppProviders";

export default function JournalScreen() {
  const router = useRouter();
  const { user, syncVersion } = useAuth();
  const { locale } = useI18n();
  const scope = `${user?.company_id || ""}:${user?.id || ""}`;
  const resource = useJournalResource(scope, syncVersion, loadJournalWorkspace);
  const workspace = resource.result?.data;
  const [filter, setFilter] = useState<"ALL" | JournalStatus>("ALL");
  const [busy, setBusy] = useState<{ key: string; projectId: string; token: symbol } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const busyProjectId = busy?.key === scope ? busy.projectId : null;
  const lt = (en: string, ru: string, he: string) => locale === "ru" ? ru : locale === "he" ? he : en;
  const statusLabel = (status: JournalStatus) => status === "ARCHIVED" ? lt("Signed", "Подписан", "נחתם") : status === "ACTIVE" ? lt("Awaiting signature", "Ожидает подписи", "ממתין לחתימה") : lt("Draft", "Черновик", "טיוטה");
  const groups = useMemo(() => workspace ? journalGroups(workspace, filter) : [], [workspace, filter]);
  const counters = useMemo(() => ({
    all: workspace?.journals.length ?? 0,
    active: workspace?.journals.filter((item) => item.status === "ACTIVE").length ?? 0,
    draft: workspace?.journals.filter((item) => item.status === "DRAFT").length ?? 0,
    archived: workspace?.journals.filter((item) => item.status === "ARCHIVED").length ?? 0,
  }), [workspace]);
  const disabled = Boolean(busyProjectId) || resource.loading;

  const prepare = async (projectId: string) => {
    if (resource.locked.current || resource.loading || resource.result?.source !== "online") return;
    resource.locked.current = true;
    resource.invalidateRead();
    const token = Symbol(projectId);
    setBusy({ key: scope, projectId, token });
    setFailure(null);
    try {
      const journal = await prepareInstallerJournal(projectId, locale);
      if (resource.isCurrent()) router.push(`/journal/${encodeURIComponent(journal.id)}` as never);
    } catch {
      if (resource.isCurrent()) setFailure(scope);
    } finally {
      resource.locked.current = false;
      setBusy((current) => current?.token === token ? null : current);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { direction: locale === "he" ? "rtl" : "ltr" }]} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.background} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={
        <RefreshControl refreshing={resource.loading} onRefresh={() => void resource.reload()} tintColor={installerTheme.accent} />
      }>
        <ScreenHero eyebrow={lt("COMPLETED WORK", "ЗАВЕРШЁННЫЕ РАБОТЫ", "עבודות שהושלמו")}
          title={lt("Work journal", "Журнал работ", "יומן עבודה")}
          subtitle={lt("Completed work and acceptance documents by project.", "Выполненные работы и акты по объектам.", "עבודות שהושלמו ומסמכי מסירה לפי פרויקט.")}
          right={<IconButton icon="refresh" label={lt("Refresh journal", "Обновить журнал", "רענון יומן")} disabled={disabled} onPress={() => void resource.reload()} />}>
          <View style={styles.heroMetrics}>
            <View><Text testID="journal-active-count" style={styles.heroMetricValue}>{workspace ? counters.active : "—"}</Text><Text style={styles.heroMetricLabel}>{lt("to sign", "на подписи", "לחתימה")}</Text></View>
            <View style={styles.metricDivider} />
            <View><Text style={styles.heroMetricValue}>{workspace ? counters.archived : "—"}</Text><Text style={styles.heroMetricLabel}>{lt("signed", "подписано", "נחתמו")}</Text></View>
          </View>
        </ScreenHero>
        {resource.result?.source === "cache" && <Text style={styles.notice}>{lt("Saved copy. Refresh online before preparing a document.", "Сохранённая копия. Для формирования акта обновите журнал онлайн.", "עותק שמור. יש לרענן ברשת לפני הכנת מסמך.")}</Text>}
        {resource.result?.source === "online" && resource.result.message && <Text style={styles.notice}>{lt("Fresh data loaded, but the offline copy could not be saved.", "Данные загружены, но офлайн-копия не сохранилась.", "הנתונים נטענו, אך העותק הלא מקוון לא נשמר.")}</Text>}
        {workspace?.localUnavailable && <Text style={styles.notice}>{lt("Local project list is unavailable. Showing available documents.", "Локальный список объектов недоступен. Показаны доступные акты.", "רשימת הפרויקטים המקומית אינה זמינה. מוצגים המסמכים הזמינים.")}</Text>}
        {failure === scope && <Text accessibilityRole="alert" style={[styles.notice, styles.error]}>{lt("Could not prepare the document. Refresh the journal before trying again.", "Не удалось сформировать акт. Обновите журнал перед повторной попыткой.", "לא ניתן להכין את המסמך. יש לרענן את היומן לפני ניסיון נוסף.")}</Text>}
        {!workspace ? resource.loading ? <View style={styles.loading}><ActivityIndicator color={installerTheme.accent} /><Text style={styles.muted}>{lt("Loading journal", "Загружаем журнал", "טוען יומן")}</Text></View> : <EmptyState icon="cloud-offline-outline" title={lt("Journal unavailable", "Журнал недоступен", "היומן אינו זמין")}
          description={lt("Check your connection and access to the project, then retry.", "Проверьте подключение и доступ к объекту, затем повторите загрузку.", "בדקו את החיבור והגישה לפרויקט ונסו שוב.")}
          action={<ActionButton label={lt("Retry", "Повторить", "ניסיון נוסף")} onPress={() => void resource.reload()} />} /> : <>
          <SegmentedControl dark stackedCounts value={filter} onChange={setFilter} options={[
            { value: "ALL", label: lt("All", "Все", "הכל"), count: counters.all },
            { value: "DRAFT", label: lt("Drafts", "Черновики", "טיוטות"), count: counters.draft },
            { value: "ACTIVE", label: lt("Signature", "Подпись", "חתימה"), count: counters.active },
            { value: "ARCHIVED", label: lt("Archive", "Архив", "ארכיון"), count: counters.archived },
          ]} />
          <SectionHeader title={lt("Projects", "Объекты", "פרויקטים")} meta={groups.length} />
          {groups.length ? groups.map(({ project, journals }) => (
            <SectionCard key={project.id} style={styles.projectCard}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${lt("Open project", "Открыть объект", "פתיחת פרויקט")}: ${project.name}`} disabled={disabled}
                onPress={() => router.push(buildProjectRoute(project.id) as never)} style={styles.projectHeader}>
                <View style={styles.projectIcon}><Ionicons name="business-outline" size={22} color={installerTheme.accent} /></View>
                <View style={styles.flex}><Text style={styles.projectName}>{project.name}</Text>{project.address ? <Text style={styles.muted}>{project.address}</Text> : null}</View>
                <Ionicons name={locale === "he" ? "chevron-back" : "chevron-forward"} size={18} color={installerTheme.textFaint} />
              </Pressable>
              {journals.map((journal) => (
                <Pressable key={journal.id} testID={`journal-document-${journal.id}`} accessibilityRole="button" disabled={disabled}
                  accessibilityLabel={`${statusLabel(journal.status)}. ${project.name}. #${journal.id.slice(0, 8)}`}
                  onPress={() => router.push(`/journal/${encodeURIComponent(journal.id)}` as never)} style={styles.document}>
                  <View style={styles.documentHeader}>
                    <StatusPill label={statusLabel(journal.status)} tone={journal.status === "ARCHIVED" ? "success" : journal.status === "ACTIVE" ? "info" : "warning"} />
                    <Text style={styles.documentCode}>#{journal.id.slice(0, 8).toUpperCase()}</Text>
                  </View>
                  <View style={styles.documentFooter}>
                    <Text style={[styles.workCount, styles.flex]}>{journal.completed_doors} {lt("doors", "дверей", "דלתות")} · {journal.completed_addons} {lt("extra works", "допработ", "עבודות נוספות")}</Text>
                    <Ionicons name={locale === "he" ? "arrow-back" : "arrow-forward"} size={18} color={installerTheme.accent} />
                  </View>
                  {journal.status === "ARCHIVED" && <Text style={[styles.muted, journal.email_delivery_status === "FAILED" && styles.error]}>{journal.email_delivery_status === "DELIVERED" ? lt("PDF sent by email", "PDF отправлен по email", "PDF נשלח בדוא״ל") : journal.email_delivery_status === "FAILED" ? lt("PDF signed · email failed", "PDF подписан · ошибка отправки", "PDF חתום · שגיאת שליחה") : lt("PDF signed · email not yet confirmed", "PDF подписан · отправка ещё не подтверждена", "PDF חתום · השליחה טרם אושרה")}</Text>}
                </Pressable>
              ))}
              {!journals.length && <>
                <Text style={styles.muted}>{lt("No acceptance document yet", "Акт ещё не сформирован", "טרם הוכן מסמך מסירה")}</Text>
                {project.installedLocally !== null && <Text style={styles.muted}>{lt("Installed on this device", "Установлено на устройстве", "הותקן במכשיר זה")}: {project.installedLocally}</Text>}
                <ActionButton label={lt("Prepare acceptance", "Сформировать акт", "הכנת מסמך מסירה")} icon="document-text-outline" variant="secondary"
                  loading={busyProjectId === project.id} disabled={disabled || resource.result?.source !== "online"} onPress={() => void prepare(project.id)} />
              </>}
            </SectionCard>
          )) : <EmptyState icon="document-text-outline" title={lt("No documents in this filter", "В этом разделе нет актов", "אין מסמכים במסנן זה")}
            description={lt("Completed work is grouped here by assigned project.", "Выполненные работы собираются по назначенным объектам.", "עבודות שהושלמו מקובצות לפי הפרויקטים שהוקצו.")}
            action={filter !== "ALL" ? <ActionButton variant="secondary" label={lt("All projects", "Все объекты", "כל הפרויקטים")} onPress={() => setFilter("ALL")} /> : undefined} />}
        </>}
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: installerTheme.background },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: installerTheme.layout.bottomNavClearance + 24, gap: 16 },
  heroMetrics: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 18 },
  heroMetricValue: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplayStrong, fontSize: 25 },
  heroMetricLabel: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMedium, fontSize: 11, marginTop: 2 },
  metricDivider: { width: 1, height: 34, backgroundColor: installerTheme.borderStrong },
  loading: { paddingVertical: 32, alignItems: "center", gap: 12 },
  notice: { color: installerTheme.warning, fontSize: 12, lineHeight: 18, padding: 12, backgroundColor: installerTheme.warningSoft, borderRadius: installerTheme.radius.md },
  error: { color: installerTheme.danger },
  projectCard: { gap: 14 },
  projectHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  projectIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: installerTheme.accentWarm, borderWidth: 1, borderColor: installerTheme.accentEdge },
  flex: { flex: 1, minWidth: 0 },
  projectName: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyStrong, fontSize: 16, lineHeight: 22 },
  muted: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18 },
  document: { gap: 10, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingTop: 14, paddingBottom: 4 },
  documentHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  documentCode: { color: installerTheme.textFaint, fontFamily: installerTheme.fontFamilyMono, fontSize: 10 },
  documentFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  workCount: { color: installerTheme.text, fontSize: 13, lineHeight: 20 },
});
