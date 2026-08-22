import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { BrandText as Text, DimaxMark } from "@/components/mobile-ui";
import { DEV_AUTO_LOGIN } from "@/lib/config";
import { installerTheme } from "@/lib/theme";
import { useAuth, useI18n } from "@/providers/AppProviders";

type FieldProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoComplete?: "off" | "email" | "current-password";
};

function LoginField({
  icon,
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType = "default",
  autoComplete = "off",
}: FieldProps) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={18} color={installerTheme.textFaint} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={label}
          placeholderTextColor={installerTheme.textFaint}
          style={styles.input}
          autoCapitalize="none"
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          accessibilityLabel={label}
          autoComplete={autoComplete}
          spellCheck={false}
        />
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { t, locale } = useI18n();
  const autoLoginStartedRef = useRef(false);
  const [companyId, setCompanyId] = useState(DEV_AUTO_LOGIN.enabled ? DEV_AUTO_LOGIN.companyId : "");
  const [email, setEmail] = useState(DEV_AUTO_LOGIN.enabled ? DEV_AUTO_LOGIN.email : "");
  const [password, setPassword] = useState(DEV_AUTO_LOGIN.enabled ? DEV_AUTO_LOGIN.password : "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(companyId.trim() && email.trim() && password.trim()),
    [companyId, email, password]
  );
  const lt = (en: string, ru: string, he: string) => (locale === "ru" ? ru : locale === "he" ? he : en);

  const runLogin = async (nextCompanyId: string, nextEmail: string, nextPassword: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await signIn(nextCompanyId.trim(), nextEmail.trim(), nextPassword);
      router.replace("/projects");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("login.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!DEV_AUTO_LOGIN.enabled || autoLoginStartedRef.current) {
      return;
    }
    autoLoginStartedRef.current = true;
    void runLogin(DEV_AUTO_LOGIN.companyId, DEV_AUTO_LOGIN.email, DEV_AUTO_LOGIN.password);
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={installerTheme.shell} />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.hero}>
            <Image
              source={require("../assets/premium/door-premium.jpg")}
              resizeMode="cover"
              style={styles.heroImage}
              accessibilityIgnoresInvertColors
            />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(8,14,21,0.22)", "rgba(8,14,21,0.82)", installerTheme.background]}
              locations={[0, 0.62, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={styles.heroArchitecture}>
              <View style={[styles.heroLine, styles.heroLineTop]} />
              <View style={[styles.heroLine, styles.heroLineBottom]} />
              <View style={styles.heroFrame} />
              <View style={styles.heroAccentRail} />
            </View>
            <View style={styles.heroTop}>
              <DimaxMark />
              <LocaleSwitcher dark />
            </View>
            <Text style={styles.heroEyebrow}>{lt("FIELD OPERATIONS", "ПОЛЕВЫЕ РАБОТЫ", "עבודת שטח")}</Text>
            <Text style={styles.heroTitle}>{lt("Your workday, even without signal.", "Рабочий день даже без связи.", "יום העבודה גם בלי קליטה.")}</Text>
            <Text style={styles.heroCopy}>
              {lt(
                "Assigned sites, doors, schedule, issues and earnings stay available offline.",
                "Объекты, двери, календарь, проблемы и заработок доступны офлайн.",
                "האתרים, הדלתות, היומן, התקלות והשכר זמינים גם אופליין."
              )}
            </Text>
            <View style={styles.heroFeatureRow}>
              <View style={styles.heroFeature}>
                <Ionicons name="cloud-offline-outline" size={18} color={installerTheme.accent} />
                <Text style={styles.heroFeatureText}>{lt("Offline first", "Работа офлайн", "עבודה אופליין")}</Text>
              </View>
              <View style={styles.heroFeature}>
                <Ionicons name="shield-checkmark-outline" size={18} color={installerTheme.accent} />
                <Text style={styles.heroFeatureText}>{lt("Your jobs only", "Только свои работы", "רק העבודות שלך")}</Text>
              </View>
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.formHead}>
              <View>
                <Text style={styles.productName}>DIMAX Installer</Text>
                <Text style={styles.productMeta}>{lt("SECURE SIGN IN", "БЕЗОПАСНЫЙ ВХОД", "כניסה מאובטחת")}</Text>
              </View>
              <View style={styles.systemPill}>
                <View style={styles.onlineDot} />
                <Text style={styles.systemText}>24/7</Text>
              </View>
            </View>

            <View style={styles.fields}>
              <LoginField
                icon="business-outline"
                label={t("login.companyId")}
                value={companyId}
                onChangeText={setCompanyId}
              />
              <LoginField
                icon="mail-outline"
                label={t("login.email")}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoComplete="email"
              />
              <LoginField
                icon="key-outline"
                label={t("login.password")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
              />
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("login.signIn")}
              accessibilityState={{ disabled: !canSubmit || submitting, busy: submitting }}
              onPress={() => void runLogin(companyId, email, password)}
              disabled={!canSubmit || submitting}
              style={({ pressed }) => [
                styles.submit,
                pressed && styles.pressed,
                (!canSubmit || submitting) && styles.disabled,
              ]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={[installerTheme.accent, "#C58D2F"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.submitText}>{submitting ? t("login.signingIn") : t("login.signIn")}</Text>
              <Ionicons name="arrow-forward" size={18} color={installerTheme.textOnAccent} />
            </Pressable>

            <View style={styles.formFooter}>
              <View style={styles.onlineDot} />
              <Text style={styles.footerText}>{lt("Offline data stays in protected app storage", "Офлайн-данные хранятся в защищённом хранилище приложения", "המידע המקומי נשמר באחסון המוגן של האפליקציה")}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: installerTheme.shell,
  },
  scroll: {
    flexGrow: 1,
  },
  hero: {
    position: "relative",
    overflow: "hidden",
    minHeight: 390,
    backgroundColor: installerTheme.shell,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 28,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  heroArchitecture: {
    ...StyleSheet.absoluteFillObject,
  },
  heroLine: {
    position: "absolute",
    start: 0,
    end: 0,
    height: 1,
    backgroundColor: installerTheme.shellOverlaySubtle,
  },
  heroLineTop: { top: 74 },
  heroLineBottom: { bottom: 42 },
  heroFrame: {
    position: "absolute",
    top: 30,
    end: -36,
    width: 158,
    height: 116,
    borderStartWidth: 1,
    borderBottomWidth: 1,
    borderColor: installerTheme.shellBorderSoft,
    transform: [{ skewX: "-18deg" }],
  },
  heroAccentRail: {
    position: "absolute",
    start: 0,
    top: 118,
    width: 3,
    height: 76,
    backgroundColor: installerTheme.accent,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 34,
  },
  heroEyebrow: {
    color: installerTheme.accent,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 9,
  },
  heroTitle: {
    maxWidth: 330,
    color: installerTheme.textOnDark,
    fontFamily: installerTheme.fontFamilyDisplayStrong,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "800",
  },
  heroCopy: {
    maxWidth: 330,
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 13,
  },
  heroFeatureRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 22,
  },
  heroFeature: {
    flex: 1,
    minHeight: 60,
    justifyContent: "center",
    gap: 5,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.shellBorderSoft,
    backgroundColor: installerTheme.shellOverlayFaint,
    padding: 10,
  },
  heroFeatureText: {
    color: installerTheme.textOnDark,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "700",
  },
  form: {
    flex: 1,
    backgroundColor: installerTheme.background,
    borderTopLeftRadius: installerTheme.radius.glass,
    borderTopRightRadius: installerTheme.radius.glass,
    borderTopWidth: 1,
    borderTopColor: installerTheme.borderStrong,
    padding: 20,
  },
  formHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  productName: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyDisplay,
    fontSize: 20,
    fontWeight: "900",
  },
  productMeta: {
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  systemPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.accentEdge,
    backgroundColor: installerTheme.accentWarm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.successFill,
  },
  systemText: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "800",
  },
  fields: {
    gap: 13,
  },
  fieldLabel: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 6,
  },
  inputShell: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.cardMuted,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 13,
    paddingVertical: 13,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: installerTheme.radius.card,
    backgroundColor: installerTheme.dangerSoft,
    padding: 11,
    marginTop: 14,
  },
  errorText: {
    flex: 1,
    color: installerTheme.danger,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
  },
  submit: {
    position: "relative",
    overflow: "hidden",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: installerTheme.radius.card,
    backgroundColor: "transparent",
    marginTop: 18,
    shadowColor: installerTheme.accent,
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  submitText: {
    color: installerTheme.textOnAccent,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 13,
    fontWeight: "900",
  },
  formFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 18,
  },
  footerText: {
    flexShrink: 1,
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.42,
  },
});
