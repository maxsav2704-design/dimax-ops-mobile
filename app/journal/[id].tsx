import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ActionButton,
  BrandText as Text,
  EmptyState,
  ConfirmDialog,
  IconButton,
  ScreenHero,
  SectionCard,
  SectionHeader,
  StatusPill,
} from "@/components/mobile-ui";
import { installerTheme } from "@/lib/theme";
import {
  loadInstallerJournal,
  markInstallerJournalReady,
  openJournalUrl,
  openSignedJournalPdf,
  refreshInstallerJournal,
} from "@/modules/journal/service";
import type { JournalDeliveryStatus, JournalStatus } from "@/modules/journal/types";
import { useJournalResource } from "@/modules/journal/use-journal-resource";
import { buildProjectRoute } from "@/modules/projects/navigation";
import { useAuth, useI18n } from "@/providers/AppProviders";

export default function JournalDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, syncVersion } = useAuth();
  const { locale } = useI18n();
  const scope = `${user?.company_id || ""}:${user?.id || ""}:${id || ""}`;
  const load = useCallback(() => id ? loadInstallerJournal(id) : Promise.reject(new Error("Missing journal ID")), [id]);
  const resource = useJournalResource(scope, syncVersion, load);
  const journal = resource.result?.data ?? null;
  const loading = resource.loading;
  const [operation, setOperation] = useState<{ key: string; kind: "refresh" | "submit" | "open" | "pdf"; token: symbol } | null>(null);
  const busy = operation?.key === scope ? operation.kind : null;
  const [notice, setNotice] = useState<{ key: string; status: JournalStatus; text: string } | null>(null);
  const [error, setError] = useState<{ key: string; status: JournalStatus; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [visibleWorks, setVisibleWorks] = useState(30);
  const online = resource.result?.source === "online";
  const actionDisabled = Boolean(busy) || loading || !online;

  const lt = (en: string, ru: string, he: string) =>
    locale === "ru" ? ru : locale === "he" ? he : en;
  const intlLocale =
    locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";
  const formatDate = (value: string | null) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(intlLocale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value))
      : "—";

  const statusInfo = useMemo(() => {
    if (journal?.status === "ARCHIVED")
      return {
        label: lt("Signed", "Подписан", "נחתם"),
        tone: "success" as const,
        icon: "shield-checkmark" as const,
      };
    if (journal?.status === "ACTIVE")
      return {
        label: lt("Awaiting signature", "Ожидает подписи", "ממתין לחתימה"),
        tone: "info" as const,
        icon: "create-outline" as const,
      };
    return {
      label: lt("Draft", "Черновик", "טיוטה"),
      tone: "warning" as const,
      icon: "document-text-outline" as const,
    };
  }, [journal?.status, locale]);

  const deliveryInfo = deliveryState(
    journal?.email_delivery_status ?? "NONE",
    lt,
  );

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    if (resource.locked.current || actionDisabled || !journal) return;
    resource.locked.current = true;
    resource.invalidateRead();
    const token = Symbol(kind);
    setOperation({ key: scope, kind, token });
    setError(null);
    try {
      await action();
    } catch {
      if (resource.isCurrent()) setConfirmation(null);
      if (resource.isCurrent()) setError({ key: scope, status: journal.status, text: kind === "pdf" || kind === "open"
        ? lt("Could not open the document. Check your connection and try again.", "Не удалось открыть документ. Проверьте подключение и повторите попытку.", "לא ניתן לפתוח את המסמך. בדקו את החיבור ונסו שוב.")
        : lt("Action not confirmed. Refresh the document before trying again.", "Действие не подтверждено. Обновите акт перед повторной попыткой.", "הפעולה לא אושרה. יש לרענן את המסמך לפני ניסיון נוסף.") });
    } finally {
      resource.release();
      setOperation((current) => current?.token === token ? null : current);
    }
  };

  const refresh = () =>
    run("refresh", async () => {
      if (!id) return;
      const updated = await refreshInstallerJournal(id);
      if (!resource.isCurrent()) return;
      resource.replace({ data: updated, source: "online", message: null });
      setNotice({ key: scope, status: updated.status, text: lt(
          "Completed work snapshot updated.",
          "Снимок завершённых работ обновлён.",
          "תמונת העבודות שהושלמו עודכנה.",
        ) });
    });

  const submit = () =>
    run("submit", async () => {
      if (!id || !journal?.can_submit || journal.status !== "DRAFT") return;
      const response = await markInstallerJournalReady(id);
      if (!resource.isCurrent()) return;
      // The successful transition is authoritative, even if a following GET would be offline.
      resource.replace({ data: { ...journal, status: "ACTIVE", can_submit: false, ...response }, source: "online", message: null });
      setConfirmation(null);
      setNotice({ key: scope, status: "ACTIVE", text: lt(
          "Document is ready for the developer's signature.",
          "Акт готов к подписи застройщика. Ссылка создана.",
          "המסמך מוכן לחתימת היזם.",
        ) });
      try { await openJournalUrl(response.signing_url); }
      catch { if (resource.isCurrent()) setError({ key: scope, status: "ACTIVE", text: lt("The link is ready but did not open. Use Open signing page.", "Ссылка готова, но не открылась. Нажмите «Открыть страницу подписи».", "הקישור מוכן אך לא נפתח. השתמשו בפתיחת דף החתימה.") }); }
    });

  if (!journal) {
    return (
      <SafeAreaView style={[styles.safe, { direction: locale === "he" ? "rtl" : "ltr" }]}>
        <View style={styles.fallback}>
          {loading ? <><ActivityIndicator color={installerTheme.accent} /><Text style={styles.caption}>{lt("Loading document", "Загружаем акт", "טוען מסמך")}</Text></> : <EmptyState
            icon="document-text-outline"
            title={lt(
              "Document unavailable",
              "Акт недоступен",
              "המסמך אינו זמין",
            )}
            description={lt("Check your connection and project access.", "Проверьте подключение и доступ к объекту.", "בדקו את החיבור והגישה לפרויקט.")}
            action={
              <ActionButton label={lt("Retry", "Повторить", "ניסיון נוסף")} onPress={() => void resource.reload()} />
            }
          />}
          <ActionButton variant="secondary" label={lt("Back to journal", "Назад в журнал", "חזרה ליומן")} onPress={() => router.replace("/journal" as never)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { direction: locale === "he" ? "rtl" : "ltr" }]} edges={["top"]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={installerTheme.background}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void resource.reload()}
            tintColor={installerTheme.accent}
          />
        }
      >
        <ScreenHero
          showMark={false}
          eyebrow={lt(
            "WORK ACCEPTANCE",
            "АКТ ВЫПОЛНЕННЫХ РАБОТ",
            "מסמך מסירת עבודה",
          )}
          title={
            journal?.project_name ||
            lt("Work document", "Акт работ", "מסמך עבודה")
          }
          subtitle={journal?.project_address}
          right={
            <IconButton
              icon={locale === "he" ? "arrow-forward" : "arrow-back"}
              label={lt("Back", "Назад", "חזרה")}
              onPress={() => router.back()}
            />
          }
        >
          <View style={styles.heroStatus}>
            <StatusPill
              label={statusInfo.label}
              tone={statusInfo.tone}
              icon={statusInfo.icon}
            />
            <Text style={styles.documentCode}>
              #{journal?.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
        </ScreenHero>

        {resource.result?.source === "cache" && <Text style={styles.blockedHint}>{lt("Saved copy. Refresh online for signing and PDF actions.", "Сохранённая копия. Обновите акт онлайн для подписи и PDF.", "עותק שמור. רעננו ברשת לפעולות חתימה ו-PDF.")}</Text>}
        {online && resource.result?.message && <Text style={styles.blockedHint}>{lt("The offline copy could not be saved.", "Офлайн-копия не сохранилась.", "העותק הלא מקוון לא נשמר.")}</Text>}
        <View style={styles.metricGrid}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {journal?.completed_doors ?? 0}
            </Text>
            <Text style={styles.metricLabel}>
              {lt("doors", "дверей", "דלתות")}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {journal?.completed_addons ?? 0}
            </Text>
            <Text style={styles.metricLabel}>
              {lt("extra works", "допработ", "עבודות נוספות")}
            </Text>
          </View>
          <View style={styles.metric}>
            <Ionicons
              name={deliveryInfo.icon}
              size={21}
              color={deliveryInfo.color}
            />
            <Text style={styles.metricLabel}>{deliveryInfo.label}</Text>
          </View>
        </View>

        <SectionCard style={styles.workflowCard}>
          <SectionHeader
            title={lt("Document route", "Маршрут документа", "מסלול המסמך")}
          />
          <WorkflowStep
            index="01"
            title={lt("Work completed", "Работы завершены", "העבודה הושלמה")}
            active
            done={Boolean(
              journal && (journal.completed_doors || journal.completed_addons),
            )}
          />
          <WorkflowStep
            index="02"
            title={lt(
              "Developer signature",
              "Подпись застройщика",
              "חתימת היזם",
            )}
            active={journal?.status === "ACTIVE"}
            done={journal?.status === "ARCHIVED"}
          />
          <WorkflowStep
            index="03"
            title={lt("PDF delivered", "PDF отправлен", "PDF נשלח")}
            active={journal?.email_delivery_status === "PENDING"}
            done={journal?.email_delivery_status === "DELIVERED"}
            last
          />
        </SectionCard>

        <View style={styles.topActions}>
          <ActionButton style={styles.topAction} variant="secondary" icon="refresh" label={lt("Check status", "Проверить статус", "בדיקת מצב")} loading={loading} disabled={Boolean(busy)} onPress={() => void resource.reload()} />
          <ActionButton style={styles.topAction} variant="secondary" icon="business-outline" label={lt("Project", "Объект", "פרויקט")} disabled={Boolean(busy)} onPress={() => router.push(buildProjectRoute(journal.project_id) as never)} />
        </View>

        <SectionCard>
          <SectionHeader title={lt("Recipient", "Получатель", "נמען")} />
          <View style={styles.workRow}>
            <Ionicons name="business-outline" size={20} color={journal.developer_email ? installerTheme.accent : installerTheme.danger} />
            <View style={styles.signedText}>
              <Text style={styles.workTitle}>{journal.developer_company || lt("Developer", "Застройщик", "יזם")}</Text>
              <Text style={styles.workMeta}>{journal.developer_email || lt("Email is not configured in the project", "Email не указан в объекте", "לא הוגדר דוא״ל בפרויקט")}</Text>
            </View>
          </View>
          <Text style={styles.caption}>
            {lt(
              "After signing, DIMAX sends the PDF to this address and copies all active administrators.",
              "После подписи DIMAX отправит PDF на этот адрес и копию всем активным администраторам.",
              "לאחר החתימה DIMAX ישלח את ה-PDF לכתובת זו עם העתק לכל המנהלים הפעילים.",
            )}
          </Text>
        </SectionCard>

        <SectionCard>
          <SectionHeader
            title={lt("Completed doors", "Завершённые двери", "דלתות שהושלמו")}
            meta={journal?.doors.length ?? 0}
          />
          {journal?.doors.length ? (
              journal.doors.slice(0, visibleWorks).map((door, index) => (
              <View key={`${door.unit_label}-${index}`} style={styles.workRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color={installerTheme.success} />
                <View style={styles.signedText}><Text style={styles.workTitle}>{door.unit_label}</Text><Text style={styles.workMeta}>{door.door_type_name}</Text><Text style={styles.workDate}>{formatDate(door.installed_at)}</Text></View>
              </View>
            ))
          ) : (
            <EmptyState
              icon="grid-outline"
              title={lt(
                "No completed doors",
                "Нет завершённых дверей",
                "אין דלתות שהושלמו",
              )}
            />
          )}
          {journal.doors.length > visibleWorks && <ActionButton variant="secondary" label={lt("Show more doors", "Показать ещё двери", "הצגת דלתות נוספות")} onPress={() => setVisibleWorks((count) => count + 30)} />}
        </SectionCard>

        {journal?.addon_items.length ? (
          <SectionCard>
            <SectionHeader
              title={lt(
                "Additional work",
                "Дополнительные работы",
                "עבודות נוספות",
              )}
              meta={journal.addon_items.length}
            />
            {journal.addon_items.map((item, index) => (
              <View key={`${item.name}-${index}`} style={styles.workRow}>
                <Ionicons name="construct-outline" size={20} color={installerTheme.accent} />
                <View style={styles.signedText}><Text style={styles.workTitle}>{item.name}</Text><Text style={styles.workMeta}>{new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 }).format(Number(item.quantity))} {item.unit}</Text>{item.comment ? <Text style={styles.workMeta}>{item.comment}</Text> : null}<Text style={styles.workDate}>{formatDate(item.done_at)}</Text></View>
              </View>
            ))}
          </SectionCard>
        ) : null}

        <SectionCard style={styles.actionCard}>
          {notice?.key === scope && notice.status === journal.status && <Text accessibilityLiveRegion="polite" style={styles.actionNotice}>{notice.text}</Text>}
          {error?.key === scope && error.status === journal.status && <Text accessibilityRole="alert" style={[styles.actionNotice, styles.errorNotice]}>{error.text}</Text>}
          {journal?.status === "DRAFT" ? (
            <>
              <ActionButton
                label={lt(
                  "Update completed work",
                  "Обновить выполненные работы",
                  "עדכון עבודות שהושלמו",
                )}
                icon="refresh"
                variant="secondary"
                loading={busy === "refresh"}
                disabled={actionDisabled}
                onPress={refresh}
              />
              <ActionButton
                label={lt(
                  "Send for developer signature",
                  "Передать на подпись застройщику",
                  "שליחה לחתימת היזם",
                )}
                icon="send"
                loading={busy === "submit"}
                disabled={!journal.can_submit || actionDisabled}
                onPress={() => setConfirmation(scope)}
              />
              {!journal.can_submit ? (
                <Text style={styles.blockedHint}>
                  {lt(
                    "To submit: completed work, developer email and an active administrator email are required.",
                    "Для отправки нужны завершённые работы, email застройщика и email активного администратора.",
                    "לשליחה נדרשים עבודות שהושלמו, דוא״ל יזם ודוא״ל מנהל פעיל.",
                  )}
                </Text>
              ) : null}
            </>
          ) : null}
          {journal?.status === "ACTIVE" && journal.signing_url ? (
            <ActionButton
              label={lt(
                "Open signing page",
                "Открыть страницу подписи",
                "פתיחת דף החתימה",
              )}
              icon="create-outline"
              loading={busy === "open"}
              disabled={actionDisabled || Boolean(journal.public_token_expires_at && Date.parse(journal.public_token_expires_at) <= Date.now())}
              onPress={() =>
                run("open", () => openJournalUrl(journal.signing_url as string))
              }
            />
          ) : null}
          {journal.status === "ACTIVE" && (!journal.signing_url || (journal.public_token_expires_at && Date.parse(journal.public_token_expires_at) <= Date.now())) && <Text style={styles.blockedHint}>{lt("Signing link unavailable or expired. Check status; ask an administrator to renew it if needed.", "Ссылка подписи недоступна или истекла. Проверьте статус; для новой ссылки обратитесь к администратору.", "קישור החתימה אינו זמין או שפג תוקפו. בדקו מצב; פנו למנהל לחידוש הקישור במידת הצורך.")}</Text>}
          {journal?.status === "ARCHIVED" ? (
            <>
              <View style={styles.signedBlock}>
                <Ionicons
                  name="shield-checkmark"
                  size={26}
                  color={installerTheme.success}
                />
                <View style={styles.signedText}>
                  <Text style={styles.signedTitle}>
                    {journal.signer_name ||
                      lt(
                        "Signed by developer",
                        "Подписано застройщиком",
                        "נחתם על ידי היזם",
                      )}
                  </Text>
                  <Text style={styles.signedMeta}>
                    {formatDate(journal.signed_at)}
                  </Text>
                </View>
              </View>
              <ActionButton
                label={lt(
                  "Open signed PDF",
                  "Открыть подписанный PDF",
                  "פתיחת PDF חתום",
                )}
                icon="document-attach-outline"
                loading={busy === "pdf"}
                disabled={actionDisabled}
                onPress={() =>
                  run("pdf", () => openSignedJournalPdf(journal.id))
                }
              />
            </>
          ) : null}
          {journal.email_delivery_status === "FAILED" && <Text style={styles.blockedHint}>{lt("Email delivery failed. The signed document is preserved. Ask an administrator to check delivery and retry.", "Письмо не отправлено. Подписанный документ сохранён. Администратор должен проверить доставку и повторить отправку.", "שליחת הדוא״ל נכשלה. המסמך החתום נשמר. על מנהל לבדוק את המשלוח ולנסות שוב.")}</Text>}
        </SectionCard>
      </ScrollView>
      {confirmation === scope && journal.status === "DRAFT" && <ConfirmDialog visible direction={locale === "he" ? "rtl" : "ltr"}
        title={lt("Prepare for signature?", "Передать на подпись?", "להכין לחתימה?")}
        message={lt("The completed-work snapshot will be locked and the developer's signing page will open. This does not sign the document or send an email.", "Снимок выполненных работ будет зафиксирован, откроется страница подписи застройщика. Это не подписывает акт и не отправляет письмо.", "תמונת העבודות שהושלמו תינעל ודף חתימת היזם ייפתח. פעולה זו אינה חותמת על המסמך ואינה שולחת דוא״ל.")}
        confirmLabel={lt("Create signing link", "Создать ссылку подписи", "יצירת קישור חתימה")} cancelLabel={lt("Cancel", "Отмена", "ביטול")}
        busy={Boolean(busy)} onConfirm={() => void submit()} onCancel={() => setConfirmation(null)} />}
    </SafeAreaView>
  );
}

function WorkflowStep({
  index,
  title,
  active,
  done,
  last = false,
}: {
  index: string;
  title: string;
  active?: boolean;
  done?: boolean;
  last?: boolean;
}) {
  const color = done
    ? installerTheme.success
    : active
      ? installerTheme.accent
      : installerTheme.textFaint;
  return (
    <View style={styles.step}>
      <View style={styles.stepTrack}>
        <View
          style={[
            styles.stepDot,
            {
              borderColor: color,
              backgroundColor: done
                ? installerTheme.success
                : installerTheme.card,
            },
          ]}
        >
          {done ? (
            <Ionicons
              name="checkmark"
              size={13}
              color={installerTheme.background}
            />
          ) : (
            <Text style={[styles.stepIndex, { color }]}>{index}</Text>
          )}
        </View>
        {!last ? (
          <View style={[styles.stepLine, done && styles.stepLineDone]} />
        ) : null}
      </View>
      <Text
        style={[styles.stepTitle, (active || done) && styles.stepTitleActive]}
      >
        {title}
      </Text>
    </View>
  );
}

function deliveryState(
  status: JournalDeliveryStatus,
  lt: (en: string, ru: string, he: string) => string,
) {
  if (status === "DELIVERED")
    return {
      label: lt("delivered", "доставлен", "נמסר"),
      icon: "mail-open-outline" as const,
      color: installerTheme.success,
    };
  if (status === "PENDING")
    return {
      label: lt("sending", "отправляется", "נשלח"),
      icon: "paper-plane-outline" as const,
      color: installerTheme.warning,
    };
  if (status === "FAILED")
    return {
      label: lt("email error", "ошибка email", "שגיאת דוא״ל"),
      icon: "alert-circle-outline" as const,
      color: installerTheme.danger,
    };
  return {
    label: lt("not sent", "не отправлен", "לא נשלח"),
    icon: "mail-outline" as const,
    color: installerTheme.textMuted,
  };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: installerTheme.background },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 34,
    gap: 16,
  },
  fallback: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  topActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topAction: { flexGrow: 1, flexBasis: 125 },
  workRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: installerTheme.border },
  workTitle: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyStrong, fontSize: 13, lineHeight: 20 },
  workMeta: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  workDate: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, lineHeight: 16, marginTop: 5 },
  heroStatus: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  documentCode: {
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: installerTheme.type.caption,
  },
  actionNotice: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 12,
    lineHeight: 18,
    borderWidth: 1,
    borderColor: installerTheme.infoBorder,
    backgroundColor: installerTheme.infoSoft,
    borderRadius: installerTheme.radius.md,
    padding: 12,
  },
  errorNotice: {
    borderColor: installerTheme.dangerBorder,
    backgroundColor: installerTheme.dangerSoft,
  },
  metricGrid: { flexDirection: "row", gap: 8 },
  metric: {
    flex: 1,
    minHeight: 82,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: installerTheme.border,
    borderRadius: installerTheme.radius.md,
    backgroundColor: installerTheme.shellRaised,
    padding: 12,
  },
  metricValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyDisplayStrong,
    fontSize: 25,
  },
  metricLabel: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: installerTheme.type.caption,
    lineHeight: 14,
  },
  workflowCard: { gap: 0 },
  step: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepTrack: { width: 30, alignItems: "center" },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndex: { fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption },
  stepLine: {
    width: 1,
    flex: 1,
    minHeight: 30,
    backgroundColor: installerTheme.borderStrong,
  },
  stepLineDone: { backgroundColor: installerTheme.successBorder },
  stepTitle: {
    flex: 1,
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 13,
    paddingTop: 5,
  },
  stepTitleActive: { color: installerTheme.text },
  caption: {
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: installerTheme.type.caption,
    lineHeight: 17,
    marginTop: 10,
  },
  actionCard: { gap: 10 },
  blockedHint: {
    color: installerTheme.warning,
    fontFamily: installerTheme.fontFamily,
    fontSize: installerTheme.type.caption,
    lineHeight: 17,
  },
  signedBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: installerTheme.radius.md,
    backgroundColor: installerTheme.successSoft,
    borderWidth: 1,
    borderColor: installerTheme.successBorder,
  },
  signedText: { flex: 1, minWidth: 0 },
  signedTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 13,
  },
  signedMeta: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: installerTheme.type.caption,
    marginTop: 3,
  },
});
