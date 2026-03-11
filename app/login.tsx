import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f", padding: 24, justifyContent: "center" }}>
      <View style={{ gap: 16 }}>
        <View style={{ alignSelf: isRTL ? "flex-end" : "flex-start" }}>
          <LocaleSwitcher />
        </View>
        <Text style={{ color: "#f8fbff", fontSize: 28, fontWeight: "700", textAlign: isRTL ? "right" : "left" }}>{t("title.login")}</Text>
        <Text style={{ color: "#8fa7c2", fontSize: 15, textAlign: isRTL ? "right" : "left" }}>{t("login.subtitle")}</Text>

        <TextInput value={companyId} onChangeText={setCompanyId} placeholder={t("login.companyId")} placeholderTextColor="#6b85a4" style={[inputStyle, { textAlign: isRTL ? "right" : "left" }]} autoCapitalize="none" />
        <TextInput value={email} onChangeText={setEmail} placeholder={t("login.email")} placeholderTextColor="#6b85a4" style={[inputStyle, { textAlign: isRTL ? "right" : "left" }]} autoCapitalize="none" keyboardType="email-address" />
        <TextInput value={password} onChangeText={setPassword} placeholder={t("login.password")} placeholderTextColor="#6b85a4" style={[inputStyle, { textAlign: isRTL ? "right" : "left" }]} secureTextEntry />

        {error ? <Text style={{ color: "#ff8b8b", textAlign: isRTL ? "right" : "left" }}>{error}</Text> : null}

        <Pressable onPress={onSubmit} disabled={!canSubmit || submitting} style={[buttonStyle, (!canSubmit || submitting) && { opacity: 0.5 }]}>
          <Text style={{ color: "#04111f", fontWeight: "700" }}>{submitting ? t("login.signingIn") : t("login.signIn")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const inputStyle = {
  backgroundColor: "#0c1d30",
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "#17314f",
  color: "#f8fbff",
  paddingHorizontal: 14,
  paddingVertical: 14,
} as const;

const buttonStyle = {
  backgroundColor: "#5aa8ff",
  borderRadius: 14,
  alignItems: "center",
  paddingVertical: 16,
} as const;
