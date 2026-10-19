import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { InstallerBottomNav } from "@/components/installer-ui";
import { ActionButton, BrandText as Text, ConfirmDialog, EmptyState, IconButton, Row, SectionCard, SectionHeader, StatusPill } from "@/components/mobile-ui";
import { Reveal } from "@/components/motion";
import { isRtlLocale } from "@/lib/i18n";
import { installerTheme } from "@/lib/theme";
import {
  AI_COPY, classifyAiFailure, confirmAiProposal, createAiTask, fetchAiStatus, getAiTask, listAiConversations, listAiTasks,
  parseAiContext, pick, previewValue, proposalRows, rejectAiProposal, sourceRoute, taskFailure,
  type AiContext, type AiConversation, type AiFailure, type AiProposal, type AiSource, type AiStatus, type AiTask,
} from "@/modules/ai/client";
import { useAuth, useI18n } from "@/providers/AppProviders";

function newId(): string {
  const random = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (random) return random.call((globalThis as { crypto?: unknown }).crypto);
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function AiScreen() {
  const { locale } = useI18n();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ context?: string; q?: string }>();
  const c = useCallback((value: { en: string; ru: string; he: string }) => pick(locale, value), [locale]);
  const rtl = isRtlLocale(locale);

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [context, setContext] = useState<AiContext | null>(() => parseAiContext(params.context));
  const [question, setQuestion] = useState(() => (Array.isArray(params.q) ? params.q[0] : params.q) ?? "");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiFailure | "decisionLost" | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<AiProposal | null>(null);
  const [epoch, setEpoch] = useState(0);
  const confirmKeys = useRef(new Map<string, string>());
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Connection and history: the history stays readable even when the model is switched off.
  useEffect(() => {
    let cancelled = false;
    setFailure(null);
    void (async () => {
      try {
        const value = await fetchAiStatus();
        if (cancelled) return;
        setStatus(value);
        const history = await listAiConversations();
        if (cancelled) return;
        setConversations(history.items);
        // A deep link with an object starts a new conversation; otherwise continue the latest one.
        if (!context && history.items[0]) {
          setConversationId(history.items[0].id);
          const page = await listAiTasks(history.items[0].id);
          if (!cancelled) setTasks(page.items);
        }
      } catch (err) {
        if (!cancelled) setFailure(classifyAiFailure(err));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, user?.id]);

  const runningId = tasks.find((task) => task.status === "RUNNING")?.id;
  useEffect(() => {
    if (!runningId) return;
    const interval = setInterval(() => {
      void getAiTask(runningId).then((task) => {
        if (mounted.current) setTasks((old) => old.map((item) => (item.id === task.id ? task : item)));
      }).catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [runningId]);

  const submit = useCallback(async () => {
    const message = question.trim();
    if (!message || busy || !status?.ready) return;
    setBusy(true); setError(null);
    try {
      const task = await createAiTask({ request_id: newId(), conversation_id: conversationId, message, locale, context });
      if (!mounted.current) return;
      setQuestion("");
      setConversationId(task.conversation_id);
      setTasks((old) => [task, ...old.filter((item) => item.id !== task.id)]);
    } catch (err) {
      if (mounted.current) setError(classifyAiFailure(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [question, busy, status?.ready, conversationId, locale, context]);

  const replaceProposal = (next: AiProposal) => setTasks((old) => old.map((task) => task.id === next.task_id
    ? { ...task, proposals: (task.proposals ?? []).map((item) => (item.id === next.id ? next : item)) } : task));

  const decide = useCallback(async (proposal: AiProposal, action: "confirm" | "reject") => {
    if (deciding) return;
    setDeciding(proposal.id); setError(null);
    try {
      // The decision token survives a lost response: the server reuses it and never saves twice.
      const key = confirmKeys.current.get(proposal.id) ?? newId();
      confirmKeys.current.set(proposal.id, key);
      const result = action === "confirm" ? await confirmAiProposal(proposal.id, key) : await rejectAiProposal(proposal.id);
      if (!mounted.current) return;
      if (result.status !== "CONFIRMED") confirmKeys.current.delete(proposal.id);
      replaceProposal(result);
      setReviewing(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error && err.name === "NetworkError" ? "decisionLost" : classifyAiFailure(err));
      setReviewing(null);
    } finally {
      if (mounted.current) setDeciding(null);
    }
  }, [deciding]);

  const openConversation = useCallback(async (conversation: AiConversation) => {
    setConversationId(conversation.id); setContext(null); setError(null);
    try {
      const page = await listAiTasks(conversation.id);
      if (mounted.current) setTasks(page.items);
    } catch (err) {
      if (mounted.current) setError(classifyAiFailure(err));
    }
  }, []);

  const openSource = useCallback((source: AiSource) => {
    const route = sourceRoute(source, { projectId: context?.kind === "project" ? context.id : null });
    if (route) router.push(route as never);
  }, [context]);

  const examples = useMemo(() => AI_COPY.examples.map((example) => c(example)), [c]);
  const awaiting = tasks.some((task) => (task.proposals ?? []).some((proposal) => proposal.status === "PROPOSED"));
  const canDecide = !!status?.actions_enabled;
  const textAlign = rtl ? "right" : "left";

  return (
    <SafeAreaView style={styles.safe} testID="ai-screen">
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.headingRow}>
            <IconButton icon={rtl ? "arrow-forward" : "arrow-back"} label={c(AI_COPY.proposal.cancel)} tone="dark" onPress={() => router.back()} />
            <View style={styles.heading}>
              <Text style={[styles.eyebrow, { textAlign }]}>{c(AI_COPY.eyebrow)}</Text>
              <Text style={[styles.title, { textAlign }]} accessibilityRole="header">{c(AI_COPY.title)}</Text>
              <Text style={[styles.subtitle, { textAlign }]}>{c(AI_COPY.subtitle)}</Text>
            </View>
            <View style={[styles.orb, busy || runningId ? styles.orbWorking : awaiting ? styles.orbAwaiting : null]} accessibilityElementsHidden>
              <View style={styles.orbCore} />
            </View>
          </View>

          {failure === "offline" ? (
            <SectionCard>
              <View testID="ai-offline" style={styles.notice}>
                <Ionicons name="cloud-offline-outline" size={20} color={installerTheme.warning} />
                <Text style={[styles.noticeText, { textAlign }]}>{c(AI_COPY.offline)}</Text>
              </View>
              <View style={styles.buttonRow}>
                <ActionButton label={c(AI_COPY.openQueue)} icon="list-outline" variant="secondary" onPress={() => router.push("/sync-queue" as never)} />
                <ActionButton label={c(AI_COPY.retry)} icon="refresh-outline" variant="dark" onPress={() => setEpoch((old) => old + 1)} />
              </View>
            </SectionCard>
          ) : null}
          {failure && failure !== "offline" ? (
            <SectionCard>
              <View testID="ai-failure" style={styles.notice}>
                <Ionicons name="alert-circle-outline" size={20} color={installerTheme.danger} />
                <Text style={[styles.noticeText, { textAlign }]}>{c(AI_COPY.failures[failure])}</Text>
              </View>
              <ActionButton label={c(AI_COPY.retry)} icon="refresh-outline" variant="dark" onPress={() => setEpoch((old) => old + 1)} />
            </SectionCard>
          ) : null}

          {status ? (
            <View style={styles.pills} testID="ai-status">
              {status.provider === "mock" ? <StatusPill label={c(AI_COPY.providerMock)} tone="warning" icon="flask-outline" /> : null}
              {!status.ready ? <StatusPill label={status.reason === "disabled" ? c(AI_COPY.disabled) : c(AI_COPY.failures.notConfigured)} tone="danger" icon="power-outline" /> : null}
              <StatusPill label={status.actions_enabled ? c(AI_COPY.actionsOn) : c(AI_COPY.actionsOff)} tone={status.actions_enabled ? "success" : "neutral"} icon="shield-checkmark-outline" />
            </View>
          ) : null}

          {context ? (
            <View style={styles.contextRow} testID="ai-context">
              <StatusPill label={`${c(AI_COPY.context)}: ${c(AI_COPY.contextKinds[context.kind])} · ${context.id.slice(0, 8)}`} tone="info" icon="locate-outline" />
              <Pressable accessibilityRole="button" onPress={() => setContext(null)} style={styles.link}>
                <Text style={styles.linkText}>{c(AI_COPY.clear)}</Text>
              </Pressable>
            </View>
          ) : null}

          <SectionCard>
            <SectionHeader title={c(AI_COPY.question)} />
            <TextInput
              testID="ai-question"
              value={question}
              onChangeText={setQuestion}
              editable={!busy}
              multiline
              maxLength={4000}
              placeholder={c(AI_COPY.empty)}
              placeholderTextColor={installerTheme.textFaint}
              style={[styles.input, { textAlign }]}
            />
            <View style={styles.chips}>
              {examples.map((example) => (
                <Pressable key={example} accessibilityRole="button" onPress={() => setQuestion(example)} style={styles.chip} disabled={busy}>
                  <Text style={styles.chipText}>{example}</Text>
                </Pressable>
              ))}
            </View>
            <ActionButton testID="ai-ask" label={busy ? c(AI_COPY.working) : c(AI_COPY.ask)} icon="sparkles-outline" loading={busy}
              disabled={busy || !status?.ready || !question.trim()} onPress={() => void submit()} />
            {error ? (
              <Text testID="ai-error" style={[styles.errorText, { textAlign }]}>
                {error === "decisionLost" ? c(AI_COPY.proposal.decisionLost) : c(AI_COPY.failures[error])}
              </Text>
            ) : null}
          </SectionCard>

          {tasks.length === 0 && !busy ? (
            <EmptyState icon="chatbubble-ellipses-outline" title={c(AI_COPY.answer)} description={c(AI_COPY.empty)} />
          ) : null}
          {[...tasks].reverse().map((task, index) => (
            <Reveal key={task.id} index={Math.min(index, 6)}>
              <SectionCard>
                <Text style={[styles.taskMessage, { textAlign }]}>{task.message}</Text>
                <Text style={[styles.taskMeta, { textAlign }]}>
                  {new Date(task.created_at).toLocaleString(locale)}
                  {task.context ? ` · ${c(AI_COPY.contextKinds[task.context.kind])}` : ""}
                  {task.reply?.steps?.length ? ` · ${task.reply.steps.length} ${c(AI_COPY.steps)}` : ""}
                </Text>
                {task.status === "RUNNING" ? <StatusPill label={c(AI_COPY.working)} tone="info" icon="hourglass-outline" /> : null}
                {task.status === "COMPLETED" && task.reply ? (
                  <Text testID="ai-answer" style={[styles.answer, { textAlign }]}>{task.reply.answer}</Text>
                ) : null}
                {task.status !== "RUNNING" && task.status !== "COMPLETED" ? (
                  <Text style={[styles.errorText, { textAlign }]}>{c(AI_COPY.failures[taskFailure(task)])}</Text>
                ) : null}
                {task.reply?.sources.length ? (
                  <View style={styles.sources}>
                    <Text style={[styles.label, { textAlign }]}>{c(AI_COPY.sources)}</Text>
                    {task.reply.sources.slice(0, 8).map((source) => (
                      <Row key={`${source.kind}:${source.id}`} icon={source.kind === "issue" ? "alert-circle-outline" : source.kind === "door" ? "cube-outline" : "business-outline"}
                        title={source.label} subtitle={c(AI_COPY.contextKinds[source.kind === "installer" ? "project" : source.kind])}
                        onPress={sourceRoute(source, { projectId: context?.kind === "project" ? context.id : null }) ? () => openSource(source) : undefined} />
                    ))}
                  </View>
                ) : null}
                {(task.proposals ?? []).map((proposal) => (
                  <View key={proposal.id} testID="ai-proposal" style={[styles.proposal, proposal.status === "EXECUTED" ? styles.proposalDone : null]}>
                    <Text style={[styles.label, { textAlign }]}>{c(AI_COPY.proposal.title)}</Text>
                    <Text style={[styles.proposalSummary, { textAlign }]}>
                      {["project", "door", "issue_title"].map((key) => proposal.preview.summary?.[key]).filter(Boolean).join(" · ")}
                    </Text>
                    <StatusPill label={deciding === proposal.id ? c(AI_COPY.proposal.status.CONFIRMED) : c(AI_COPY.proposal.status[proposal.status])}
                      tone={proposal.status === "EXECUTED" ? "success" : proposal.status === "PROPOSED" ? "warning" : "neutral"}
                      icon={proposal.status === "EXECUTED" ? "checkmark-circle-outline" : "time-outline"} />
                    {proposalRows(proposal.preview).map((row) => (
                      <View key={row.key} style={styles.diffRow}>
                        <Text style={[styles.diffKey, { textAlign }]}>{AI_COPY.fields[row.key] ? c(AI_COPY.fields[row.key]) : row.key}</Text>
                        <Text style={[styles.diffBefore, { textAlign }]}>{previewValue(locale, row.before)}</Text>
                        <Text style={[styles.diffAfter, { textAlign }]}>{row.changed ? previewValue(locale, row.after) : c(AI_COPY.unchanged)}</Text>
                      </View>
                    ))}
                    {proposal.status === "EXECUTED" && proposal.result?.sources?.length ? (
                      <View style={styles.sources}>
                        <Text style={[styles.label, { textAlign }]}>{c(AI_COPY.proposal.open)}</Text>
                        {proposal.result.sources.map((source) => (
                          <Row key={`${source.kind}:${source.id}`} icon="open-outline" title={source.label} tone="success"
                            onPress={sourceRoute(source) ? () => openSource(source) : undefined} />
                        ))}
                      </View>
                    ) : null}
                    {proposal.status === "PROPOSED" ? (
                      <View style={styles.buttonRow}>
                        <ActionButton testID="ai-proposal-review" label={c(AI_COPY.proposal.review)} icon="checkmark-outline"
                          disabled={!canDecide || deciding === proposal.id} onPress={() => setReviewing(proposal)} />
                        <ActionButton testID="ai-proposal-reject" label={c(AI_COPY.proposal.reject)} icon="close-outline" variant="secondary"
                          disabled={!canDecide || deciding === proposal.id} onPress={() => void decide(proposal, "reject")} />
                      </View>
                    ) : null}
                  </View>
                ))}
              </SectionCard>
            </Reveal>
          ))}

          {conversations.length ? (
            <SectionCard>
              <SectionHeader title={c(AI_COPY.history)} />
              {conversations.slice(0, 5).map((conversation) => (
                <Row key={conversation.id} icon="chatbubbles-outline" title={conversation.title}
                  subtitle={new Date(conversation.updated_at).toLocaleDateString(locale)}
                  tone={conversation.id === conversationId ? "info" : "neutral"} onPress={() => void openConversation(conversation)} />
              ))}
              <ActionButton label={c(AI_COPY.newConversation)} icon="add-outline" variant="secondary"
                onPress={() => { setConversationId(null); setTasks([]); setError(null); }} />
            </SectionCard>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmDialog
        visible={!!reviewing}
        title={reviewing ? c(AI_COPY.proposal.title) : ""}
        message={reviewing ? `${c(AI_COPY.proposal.dialog)}\n\n${proposalRows(reviewing.preview).filter((row) => row.changed)
          .map((row) => `${AI_COPY.fields[row.key] ? c(AI_COPY.fields[row.key]) : row.key}: ${previewValue(locale, row.after)}`).join("\n")}` : ""}
        confirmLabel={c(AI_COPY.proposal.confirm)}
        cancelLabel={c(AI_COPY.proposal.cancel)}
        busy={!!deciding}
        confirmIcon="checkmark-outline"
        onConfirm={() => { if (reviewing) void decide(reviewing, "confirm"); }}
        onCancel={() => setReviewing(null)}
        direction={rtl ? "rtl" : "ltr"}
      />
      <InstallerBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: installerTheme.background },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 120, gap: 12 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heading: { flex: 1, gap: 4 },
  eyebrow: { color: installerTheme.textMuted, fontSize: 12, letterSpacing: 1.2, fontWeight: "700" },
  title: { color: installerTheme.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: installerTheme.textMuted, fontSize: 13, lineHeight: 18 },
  orb: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: installerTheme.accentEdge, alignItems: "center", justifyContent: "center", backgroundColor: installerTheme.accentWarm },
  orbWorking: { borderColor: installerTheme.primary, backgroundColor: installerTheme.primarySoft },
  orbAwaiting: { borderColor: installerTheme.warning, backgroundColor: installerTheme.warningSoft },
  orbCore: { width: 20, height: 20, borderRadius: 10, backgroundColor: installerTheme.accent },
  notice: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 12 },
  noticeText: { flex: 1, color: installerTheme.text, fontSize: 13, lineHeight: 18 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  contextRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  link: { paddingVertical: 4, paddingHorizontal: 6 },
  linkText: { color: installerTheme.primary, fontSize: 13, fontWeight: "600" },
  input: { minHeight: 84, borderWidth: 1, borderColor: installerTheme.border, borderRadius: 12, padding: 12, color: installerTheme.text, fontSize: 14, backgroundColor: installerTheme.shell, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  chip: { borderWidth: 1, borderColor: installerTheme.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: installerTheme.shellMuted },
  chipText: { color: installerTheme.text, fontSize: 12 },
  errorText: { color: installerTheme.danger, fontSize: 13, marginTop: 8 },
  taskMessage: { color: installerTheme.text, fontSize: 15, fontWeight: "700" },
  taskMeta: { color: installerTheme.textFaint, fontSize: 12, marginBottom: 8 },
  answer: { color: installerTheme.text, fontSize: 14, lineHeight: 21, marginTop: 6 },
  sources: { marginTop: 10, gap: 4 },
  label: { color: installerTheme.textMuted, fontSize: 12, letterSpacing: 1, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  proposal: { marginTop: 12, borderWidth: 1, borderColor: installerTheme.accentEdge, borderRadius: 14, padding: 12, gap: 8, backgroundColor: installerTheme.shell },
  proposalDone: { borderColor: installerTheme.success },
  proposalSummary: { color: installerTheme.textMuted, fontSize: 12 },
  diffRow: { flexDirection: "row", gap: 8, borderTopWidth: 1, borderTopColor: installerTheme.border, paddingTop: 6 },
  diffKey: { flex: 1.2, color: installerTheme.textMuted, fontSize: 12 },
  diffBefore: { flex: 1, color: installerTheme.textFaint, fontSize: 12 },
  diffAfter: { flex: 1.2, color: installerTheme.text, fontSize: 12, fontWeight: "700" },
});
