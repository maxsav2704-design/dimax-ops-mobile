import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import {
  ActionButton,
  IconButton,
  Row,
  ScreenHero,
  SectionCard,
  SectionHeader,
  StatusPill,
} from "@/components/mobile-ui";
import { installerTheme } from "@/lib/theme";
import { getLastSyncAt, getSyncQueueSummary, runSync } from "@/modules/sync/service";
import type { SyncQueueSummary } from "@/modules/sync/types";
import { useAuth, useI18n } from "@/providers/AppProviders";

export default function ProfileScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const { locale } = useI18n();
  const [queue, setQueue] = useState<SyncQueueSummary | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";
  const formatSyncTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(intlLocale, {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value))
      : lt("Not yet", "Ещё не было", "עדיין לא");

  const reload = async () => {
    const [queueRow, syncAt] = await Promise.all([getSyncQueueSummary(), getLastSyncAt()]);
    setQueue(queueRow);
    setLastSyncAt(syncAt);
  };

  useEffect(() => {
    void reload();
  }, []);

  const syncNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await runSync({ forceRetry: true });
      await refreshUser();
      await reload();
      setLastSyncAt(response.server_time);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : lt("Sync failed", "Ошибка синхронизации", "הסנכרון נכשל"));
    } finally {
      setBusy(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      lt("Sign out", "Выйти", "יציאה"),
      queue?.total
        ? lt(
            `${queue.total} queued actions remain on this phone. Sign out only after they sync.`,
            `На телефоне осталось действий в очереди: ${queue.total}. Лучше выйти после синхронизации.`,
            `${queue.total} פעולות עדיין בתור. מומלץ לצאת לאחר הסנכרון.`
          )
        : lt("Sign out of DIMAX Installer?", "Выйти из DIMAX Installer?", "לצאת מ-DIMAX Installer?"),
      [
        { text: lt("Cancel", "Отмена", "ביטול"), style: "cancel" },
        {
          text: lt("Sign out", "Выйти", "יציאה"),
          style: "destructive",
          onPress: () => void signOut(),
        },
      ]
    );
  };

  const initials = (user?.full_name || user?.email || "D")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          eyebrow={lt("ACCOUNT & DEVICE", "АККАУНТ И УСТРОЙСТВО", "חשבון ומכשיר")}
          title={lt("My profile", "Мой профиль", "הפרופיל שלי")}
          subtitle={user?.email}
          right={
            <IconButton
              icon="sync"
              label={lt("Sync now", "Синхронизировать", "סנכרן")}
              tone="dark"
              onPress={() => void syncNow()}
              disabled={busy}
            />
          }
        >
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.identityBody}>
              <Text style={styles.name}>{user?.full_name || lt("Installer", "Монтажник", "מתקין")}</Text>
              <View style={styles.badges}>
                <StatusPill label={user?.role || "INSTALLER"} tone="accent" />
                <StatusPill
                  label={user?.is_active ? lt("Active", "Активен", "פעיל") : lt("Inactive", "Неактивен", "לא פעיל")}
                  tone={user?.is_active ? "success" : "danger"}
                />
              </View>
            </View>
          </View>
        </ScreenHero>

        <View style={styles.body}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <SectionCard>
            <SectionHeader title={lt("Account", "Аккаунт", "חשבון")} />
            <Row icon="mail-outline" title={lt("Email", "Email", "אימייל")} value={user?.email || "—"} tone="info" />
            <Row icon="business-outline" title={lt("Company", "Компания", "חברה")} value={user?.company_id?.slice(0, 8) || "—"} tone="accent" />
            <Row icon="finger-print-outline" title={lt("User ID", "ID пользователя", "מזהה משתמש")} value={user?.id?.slice(0, 8) || "—"} />
          </SectionCard>

          <SectionCard>
            <SectionHeader title={lt("Offline & sync", "Офлайн и синхронизация", "אופליין וסנכרון")} />
            <Row
              icon="cloud-upload-outline"
              title={lt("Sync queue", "Очередь синка", "תור סנכרון")}
              subtitle={
                queue?.total
                  ? lt(`${queue.total} actions waiting`, `Ожидают действий: ${queue.total}`, `${queue.total} פעולות ממתינות`)
                  : lt("All local work is synchronized", "Все локальные действия синхронизированы", "כל הפעולות מסונכרנות")
              }
              tone={queue?.blocked ? "danger" : queue?.total ? "warning" : "success"}
              onPress={() => router.push("/sync-queue" as never)}
            />
            <Row
              icon="time-outline"
              title={lt("Last sync", "Последняя синхронизация", "סנכרון אחרון")}
              value={formatSyncTime(lastSyncAt)}
            />
            <ActionButton
              label={lt("Sync now", "Синхронизировать сейчас", "סנכרן עכשיו")}
              icon="sync"
              loading={busy}
              disabled={busy}
              style={styles.sectionAction}
              onPress={() => void syncNow()}
            />
          </SectionCard>

          <SectionCard>
            <SectionHeader title={lt("App settings", "Настройки приложения", "הגדרות אפליקציה")} />
            <View style={styles.languageRow}>
              <View>
                <Text style={styles.settingTitle}>{lt("Language", "Язык", "שפה")}</Text>
                <Text style={styles.settingMeta}>{lt("Interface and date labels", "Интерфейс и подписи дат", "ממשק ותוויות תאריך")}</Text>
              </View>
              <LocaleSwitcher />
            </View>
            <Row
              icon="help-circle-outline"
              title={lt("Help", "Помощь", "עזרה")}
              subtitle={lt("Contact the office if a job or sync action is unclear.", "Свяжитесь с офисом, если непонятна работа или синхронизация.", "פנה למשרד אם עבודה או סנכרון אינם ברורים.")}
              tone="purple"
            />
          </SectionCard>

          <ActionButton
            label={lt("Sign out", "Выйти", "יציאה")}
            icon="log-out-outline"
            variant="danger"
            onPress={confirmSignOut}
          />

          <Text style={styles.version}>DIMAX Installer · v0.1.0</Text>
        </View>
      </ScrollView>
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  identity: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18 },
  avatar: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: installerTheme.accent,
    backgroundColor: installerTheme.shellMuted,
  },
  avatarText: { color: installerTheme.textOnDark, fontSize: 17, fontWeight: "900" },
  identityBody: { flex: 1, minWidth: 0 },
  name: { color: installerTheme.textOnDark, fontSize: 18, fontWeight: "800" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  body: { gap: 12, padding: 12 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: "#F5C2BC",
    backgroundColor: installerTheme.dangerSoft,
    padding: 11,
  },
  errorText: { flex: 1, color: installerTheme.danger, fontSize: 11 },
  sectionAction: { marginTop: 12 },
  languageRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: installerTheme.border,
  },
  settingTitle: { color: installerTheme.text, fontSize: 12, fontWeight: "800" },
  settingMeta: { color: installerTheme.textMuted, fontSize: 9, marginTop: 3 },
  version: { color: installerTheme.textFaint, fontSize: 9, textAlign: "center", marginTop: 2 },
});
