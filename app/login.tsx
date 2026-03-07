import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
import { useAuth } from "@/providers/AppProviders";

export default function LoginScreen() {
  const { signIn } = useAuth();
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
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#04111f", padding: 24, justifyContent: "center" }}>
      <View style={{ gap: 16 }}>
        <Text style={{ color: "#f8fbff", fontSize: 28, fontWeight: "700" }}>DIMAX Installer</Text>
        <Text style={{ color: "#8fa7c2", fontSize: 15 }}>Offline-first installer workspace with cursor sync.</Text>

        <TextInput value={companyId} onChangeText={setCompanyId} placeholder="Company UUID" placeholderTextColor="#6b85a4" style={inputStyle} autoCapitalize="none" />
        <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#6b85a4" style={inputStyle} autoCapitalize="none" keyboardType="email-address" />
        <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#6b85a4" style={inputStyle} secureTextEntry />

        {error ? <Text style={{ color: "#ff8b8b" }}>{error}</Text> : null}

        <Pressable onPress={onSubmit} disabled={!canSubmit || submitting} style={[buttonStyle, (!canSubmit || submitting) && { opacity: 0.5 }]}>
          <Text style={{ color: "#04111f", fontWeight: "700" }}>{submitting ? "Signing in..." : "Sign In"}</Text>
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
