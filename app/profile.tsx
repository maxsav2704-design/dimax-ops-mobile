import { localizeWorkflowMessage } from "@/modules/sync/messages";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallerBottomNav } from "@/components/installer-ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import {
  ActionButton,
  BrandText as Text,
  ConfirmDialog,
  IconButton,
  Row,
  ScreenHero,
  SectionCard,
  SectionHeader,
  StatusPill,
} from "@/components/mobile-ui";
import { translateEnum } from "@/lib/i18n";
import { SessionChangedError } from "@/lib/errors";
import { assertWorkspaceContext, captureWorkspaceContext } from "@/lib/workspace-context";
import { installerTheme } from "@/lib/theme";
import { getSyncStatusSnapshot, runSync } from "@/modules/sync/service";
import { buildProfileQueuePresentation } from "@/modules/sync/presentation";
import { useAuth, useI18n } from "@/providers/AppProviders";

export default function ProfileScreen() {
  const { user, loading: authLoading, syncVersion, signOut, refreshUser } = useAuth();
  const { locale } = useI18n();
  const [snapshot, setSnapshot] = useState<(Awaited<ReturnType<typeof getSyncStatusSnapshot>> & { ownerKey: string }) | null>(null);
  const [reading, setReading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const readRequest = useRef(0);
  const [busy, setBusy] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownerKey = user ? `${user.company_id}:${user.id}` : null;
  const queue = snapshot?.ownerKey === ownerKey ? snapshot?.queue ?? null : null;
  const lastSyncAt = snapshot?.ownerKey === ownerKey ? snapshot?.lastSyncAt ?? null : null;
  const queueView = buildProfileQueuePresentation(queue, reading || authLoading, readFailed, locale);
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

  const reload = useCallback(async (): Promise<"ready" | "error" | "stale"> => {
    if (authLoading || !ownerKey) return "stale";
    const context = captureWorkspaceContext();
    if (context.database?.ownerKey !== ownerKey) return "stale";
    const request = ++readRequest.current;
    setReading(true);
    setReadFailed(false);
    try {
      const value = await getSyncStatusSnapshot();
      assertWorkspaceContext(context);
      if (request !== readRequest.current) return "stale";
      setSnapshot({ ...value, ownerKey });
      return "ready";
    } catch (reason) {
      if (request !== readRequest.current || reason instanceof SessionChangedError) return "stale";
      setSnapshot(null);
      setReadFailed(true);
      return "error";
    } finally {
      if (request === readRequest.current) setReading(false);
    }
  }, [authLoading, ownerKey]);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    setBusy(false);
    setReadFailed(false);
    setReading(true);
    setShowSignOutConfirm(false);
    return () => { readRequest.current += 1; };
  }, [ownerKey]);

  useEffect(() => {
    void reload();
  }, [reload, syncVersion]);

  const syncNow = async () => {
    if (busy || reading || authLoading) return;
    const context = captureWorkspaceContext();
    setBusy(true);
    setError(null);
    try {
      await runSync({ forceRetry: true });
      assertWorkspaceContext(context);
      await refreshUser();
      assertWorkspaceContext(context);
    } catch (reason) {
      try { assertWorkspaceContext(context); } catch { return; }
      if (reason instanceof SessionChangedError) return;
      setError(reason instanceof Error ? localizeWorkflowMessage(reason.message, locale) : lt("Sync failed", "Ошибка синхронизации", "הסנכרון נכשל"));
    } finally {
      try {
        assertWorkspaceContext(context);
        await reload();
        assertWorkspaceContext(context);
        setBusy(false);
      } catch {
        // The next identity owns its own loading and error state.
      }
    }
  };

  const confirmSignOut = async () => {
    if (busy || reading || authLoading) return;
    const context = captureWorkspaceContext();
    const result = await reload();
    try { assertWorkspaceContext(context); } catch { return; }
    if (result !== "stale") setShowSignOutConfirm(true);
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
      <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHero
          showMark={false}
          eyebrow={lt("ACCOUNT & DEVICE", "АККАУНТ И УСТРОЙСТВО", "חשבון ומכשיר")}
          title={lt("My profile", "Мой профиль", "הפרופיל שלי")}
          subtitle={user?.email}
          right={
            <IconButton
              icon="sync"
              label={lt("Sync now", "Синхронизировать", "סנכרן")}
              tone="dark"
              onPress={() => void syncNow()}
              disabled={busy || reading || authLoading}
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
                <StatusPill label={translateEnum(locale, user?.role || "INSTALLER")} tone="accent" />
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
            <Row icon="mail-outline" title={lt("Email", "Эл. почта", "דוא״ל")} value={user?.email || "—"} tone="info" />
            <Row icon="business-outline" title={lt("Company", "Компания", "חברה")} value={user?.company_id?.slice(0, 8) || "—"} tone="accent" />
            <Row icon="finger-print-outline" title={lt("User ID", "ID пользователя", "מזהה משתמש")} value={user?.id?.slice(0, 8) || "—"} />
          </SectionCard>

          <SectionCard>
            <SectionHeader title={lt("Offline & sync", "Офлайн и синхронизация", "אופליין וסנכרון")} />
            <Row
              icon="cloud-upload-outline"
              title={lt("Sync queue", "Очередь синка", "תור סנכרון")}
              subtitle={queueView.subtitle}
              tone={queueView.tone}
              onPress={() => router.push("/sync-queue" as never)}
            />
            <Row
              icon="time-outline"
              title={lt("Last sync", "Последняя синхронизация", "סנכרון אחרון")}
              value={queueView.state === "ready" ? formatSyncTime(lastSyncAt) : lt("Unknown", "Неизвестно", "לא ידוע")}
            />
            {queueView.state === "error" ? (
              <ActionButton
                label={lt("Check saved work again", "Проверить сохранённые работы", "בדוק שוב עבודות שמורות")}
                icon="refresh-outline"
                variant="secondary"
                disabled={busy || reading || authLoading}
                style={styles.sectionAction}
                onPress={() => void reload()}
              />
            ) : null}
            <ActionButton
              label={lt("Sync now", "Синхронизировать сейчас", "סנכרן עכשיו")}
              icon="sync"
              loading={busy}
              disabled={busy || reading || authLoading}
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
              icon="call-outline"
              title={lt("Project contacts", "Контакты объектов", "אנשי קשר בפרויקטים")}
              onPress={() => router.push("/projects" as never)}
              tone="purple"
            />
          </SectionCard>

          <ActionButton
            label={lt("Sign out", "Выйти", "יציאה")}
            icon="log-out-outline"
            variant="danger"
            disabled={busy || reading || authLoading}
            onPress={() => void confirmSignOut()}
          />

          <Text style={styles.version}>DIMAX Installer · v0.1.0</Text>
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={showSignOutConfirm}
        title={lt("Sign out", "Выйти", "יציאה")}
        message={queueView.signOutMessage}
        confirmLabel={lt("Sign out", "Выйти", "יציאה")}
        cancelLabel={lt("Cancel", "Отмена", "ביטול")}
        danger
        busy={reading || authLoading || busy}
        confirmIcon="log-out-outline"
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={() => {
          setShowSignOutConfirm(false);
          void signOut();
        }}
      />
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: installerTheme.background },
  content: { flex: 1 },
  scroll: { paddingBottom: installerTheme.layout.bottomNavClearance },
  identity: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 14 },
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
  body: { gap: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.dangerBorder,
    backgroundColor: installerTheme.dangerSoft,
    padding: 11,
  },
  errorText: { flex: 1, color: installerTheme.danger, fontSize: installerTheme.type.caption },
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
  settingMeta: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, marginTop: 3 },
  version: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, textAlign: "center", marginTop: 2 },
});
