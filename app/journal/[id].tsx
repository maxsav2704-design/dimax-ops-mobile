import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
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
  IconButton,
  Row,
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
import type {
  InstallerJournalDetails,
  JournalDeliveryStatus,
  JournalStatus,
} from "@/modules/journal/types";
import { useI18n } from "@/providers/AppProviders";

export default function JournalDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { locale } = useI18n();
  const [journal, setJournal] = useState<InstallerJournalDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<
    "refresh" | "submit" | "open" | "pdf" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lt = (en: string, ru: string, he: string) =>
    locale === "ru" ? ru : locale === "he" ? he : en;
  const intlLocale =
    locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";
  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(intlLocale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value))
      : "—";

  const reload = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const result = await loadInstallerJournal(id);
      setJournal(result.data);
      setNotice(
        result.source === "cache"
          ? lt(
              "Offline copy. Signing actions require a connection.",
              "Офлайн-копия. Для подписи и PDF нужна сеть.",
              "עותק לא מקוון. פעולות חתימה ו-PDF דורשות חיבור.",
            )
          : null,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : lt(
              "Unable to load document",
              "Не удалось загрузить акт",
              "לא ניתן לטעון את המסמך",
            ),
      );
    }
  }, [id, locale]);

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, [reload]);

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

  const run = async (kind: typeof busy, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : lt(
              "Action failed",
              "Не удалось выполнить действие",
              "הפעולה נכשלה",
            ),
      );
    } finally {
      setBusy(null);
    }
  };

  const refresh = () =>
    run("refresh", async () => {
      if (!id) return;
      const updated = await refreshInstallerJournal(id);
      setJournal(updated);
      setNotice(
        lt(
          "Completed work snapshot updated.",
          "Снимок завершённых работ обновлён.",
          "תמונת העבודות שהושלמו עודכנה.",
        ),
      );
    });

  const submit = () =>
    run("submit", async () => {
      if (!id) return;
      const response = await markInstallerJournalReady(id);
      const updated = await loadInstallerJournal(id);
      setJournal({
        ...updated.data,
        signing_url: response.signing_url,
        public_token_expires_at: response.public_token_expires_at,
      });
      setNotice(
        lt(
          "Document is ready for the developer's signature.",
          "Акт отправлен на подпись застройщику.",
          "המסמך מוכן לחתימת היזם.",
        ),
      );
      await openJournalUrl(response.signing_url);
    });

  if (!journal && !loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.fallback}>
          <EmptyState
            icon="document-text-outline"
            title={lt(
              "Document unavailable",
              "Акт недоступен",
              "המסמך אינו זמין",
            )}
            description={error}
            action={
              <ActionButton
                label={lt("Back to journal", "Назад в журнал", "חזרה ליומן")}
                onPress={() => router.replace("/journal" as never)}
              />
            }
          />
        </View>
      </SafeAreaView>
    );
  }

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
              icon="arrow-back"
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

        {notice ? (
          <View style={styles.notice}>
            <Ionicons
              name="information-circle-outline"
              size={17}
              color={installerTheme.info}
            />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.notice, styles.errorNotice]}>
            <Ionicons
              name="alert-circle-outline"
              size={17}
              color={installerTheme.danger}
            />
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

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

        <SectionCard>
          <SectionHeader title={lt("Recipient", "Получатель", "נמען")} />
          <Row
            icon="business-outline"
            title={
              journal?.developer_company || lt("Developer", "Застройщик", "יזם")
            }
            subtitle={
              journal?.developer_email ||
              lt(
                "Email is not configured in the project",
                "Email не указан в объекте",
                "לא הוגדר דוא״ל בפרויקט",
              )
            }
            tone={journal?.developer_email ? "accent" : "danger"}
          />
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
            journal.doors.map((door, index) => (
              <Row
                key={`${door.unit_label}-${index}`}
                icon="checkmark-circle-outline"
                title={door.unit_label}
                subtitle={door.door_type_name}
                value={formatDate(door.installed_at)}
                tone="success"
              />
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
              <Row
                key={`${item.name}-${index}`}
                icon="construct-outline"
                title={item.name}
                subtitle={[formatDate(item.done_at), item.comment]
                  .filter(Boolean)
                  .join(" · ")}
                value={`${item.quantity} ${item.unit}`}
                tone="purple"
              />
            ))}
          </SectionCard>
        ) : null}

        <SectionCard style={styles.actionCard}>
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
                disabled={!journal.can_submit}
                onPress={submit}
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
              onPress={() =>
                run("open", () => openJournalUrl(journal.signing_url as string))
              }
            />
          ) : null}
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
                onPress={() =>
                  run("pdf", () => openSignedJournalPdf(journal.id))
                }
              />
            </>
          ) : null}
        </SectionCard>
      </ScrollView>
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
  fallback: { flex: 1, justifyContent: "center", padding: 24 },
  heroStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  documentCode: {
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 11,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
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
  noticeText: {
    flex: 1,
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 12,
    lineHeight: 18,
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
    fontSize: 10,
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
  stepIndex: { fontFamily: installerTheme.fontFamilyMono, fontSize: 9 },
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
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
  },
  actionCard: { gap: 10 },
  blockedHint: {
    color: installerTheme.warning,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
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
  signedText: { flex: 1 },
  signedTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 13,
  },
  signedMeta: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
    marginTop: 3,
  },
});
