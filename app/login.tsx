import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
import { installerTheme } from "@/components/installer-ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useAuth } from "@/providers/AppProviders";
import { useI18n } from "@/providers/AppProviders";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { t, isRTL } = useI18n();
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(companyId.trim() && email.trim() && password.trim()),
    [companyId, email, password]
  );

  const onSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(companyId.trim(), email.trim(), password);
      router.replace("/projects");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: installerTheme.background, padding: 24, justifyContent: "center" }}>
      <View style={{ gap: 18 }}>
        <View style={{ alignSelf: isRTL ? "flex-end" : "flex-start", marginBottom: 8 }}>
          <LocaleSwitcher />
        </View>
        <View style={heroCard}>
          <View style={brandBadge}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800" }}>D</Text>
          </View>
          <Text style={{ color: installerTheme.text, fontSize: 28, fontWeight: "700", textAlign: isRTL ? "right" : "left" }}>{t("title.login")}</Text>
          <Text style={{ color: installerTheme.textMuted, fontSize: 15, textAlign: isRTL ? "right" : "left", marginTop: 4 }}>{t("login.subtitle")}</Text>

          <View style={{ gap: 12, marginTop: 10 }}>
            <TextInput value={companyId} onChangeText={setCompanyId} placeholder={t("login.companyId")} placeholderTextColor="#94A3B8" style={[inputStyle, { textAlign: isRTL ? "right" : "left" }]} autoCapitalize="none" />
            <TextInput value={email} onChangeText={setEmail} placeholder={t("login.email")} placeholderTextColor="#94A3B8" style={[inputStyle, { textAlign: isRTL ? "right" : "left" }]} autoCapitalize="none" keyboardType="email-address" />
            <TextInput value={password} onChangeText={setPassword} placeholder={t("login.password")} placeholderTextColor="#94A3B8" style={[inputStyle, { textAlign: isRTL ? "right" : "left" }]} secureTextEntry />
          </View>

          {error ? <Text style={{ color: installerTheme.danger, textAlign: isRTL ? "right" : "left", marginTop: 4 }}>{error}</Text> : null}

          <Pressable onPress={onSubmit} disabled={!canSubmit || submitting} style={[buttonStyle, (!canSubmit || submitting) && { opacity: 0.5 }]}>
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{submitting ? t("login.signingIn") : t("login.signIn")}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const inputStyle = {
  backgroundColor: installerTheme.cardMuted,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: installerTheme.border,
  color: installerTheme.text,
  paddingHorizontal: 16,
  paddingVertical: 15,
} as const;

const buttonStyle = {
  backgroundColor: installerTheme.primary,
  borderRadius: 16,
  alignItems: "center",
  paddingVertical: 16,
  marginTop: 6,
} as const;

const heroCard = {
  backgroundColor: installerTheme.card,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: installerTheme.border,
  padding: 22,
  gap: 6,
} as const;

const brandBadge = {
  width: 56,
  height: 56,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: installerTheme.primary,
  marginBottom: 6,
} as const;
