import { apiFetch } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/errors";
import type { MobileLocale } from "@/lib/i18n";
import type { AiContext } from "@/modules/ai/navigation";

export { buildAiRoute, parseAiContext, type AiContext, type AiContextKind } from "@/modules/ai/navigation";

// DIMAX AI for the installer: the same server mechanism as the office workspace
// (installer API, own positions only). The app's offline door actions and the
// sync queue do not depend on it: without network the screen says so and points
// to the queue.

export const AI_API = "/api/v1/installer/ai";

export type AiStatus = {
  ready: boolean;
  reason: "ready" | "disabled" | "missing_api_key" | "missing_model";
  tools: string[];
  provider?: "openai" | "mock";
  actions_enabled?: boolean;
  real_model_verified?: false;
};
export type AiSource = { kind: "project" | "door" | "issue" | "installer"; id: string; label: string; path: string };
export type AiStep = { tool: string; ok: boolean; ms: number };
export type AiReply = { answer: string; sources: AiSource[]; tools_used: string[]; steps?: AiStep[]; provider?: "openai" | "mock" };
export type AiProposalStatus = "PROPOSED" | "CONFIRMED" | "EXECUTED" | "REJECTED" | "EXPIRED" | "FAILED" | "CONFLICT";
export type AiProposal = {
  id: string; task_id: string; tool_name: string; status: AiProposalStatus;
  preview: { entity?: AiSource; summary?: Record<string, unknown>; before?: Record<string, unknown>; after?: Record<string, unknown> };
  result: { result?: Record<string, unknown>; sources?: AiSource[]; message?: string } | null;
  error_code: string | null; expires_at: string;
};
export type AiTask = {
  id: string; conversation_id: string; message: string; context?: AiContext | null;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "INTERRUPTED" | "CANCELLED";
  reply: AiReply | null; error_code: string | null; proposals?: AiProposal[]; created_at: string;
};
export type AiConversation = { id: string; title: string; updated_at: string };

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function fetchAiStatus(): Promise<AiStatus> {
  return apiFetch<AiStatus>(`${AI_API}/status`);
}
export function listAiConversations(): Promise<{ items: AiConversation[] }> {
  return apiFetch(`${AI_API}/conversations?limit=10&offset=0`);
}
export function listAiTasks(conversationId: string): Promise<{ items: AiTask[] }> {
  return apiFetch(`${AI_API}/conversations/${conversationId}/tasks?limit=20&offset=0`);
}
export function getAiTask(taskId: string): Promise<AiTask> {
  return apiFetch(`${AI_API}/tasks/${taskId}`);
}
export function createAiTask(body: { request_id: string; conversation_id: string | null; message: string; locale: MobileLocale; context: AiContext | null }): Promise<AiTask> {
  return apiFetch(`${AI_API}/tasks`, json(body));
}
export function confirmAiProposal(proposalId: string, requestId: string): Promise<AiProposal> {
  return apiFetch(`${AI_API}/proposals/${proposalId}/confirm`, json({ request_id: requestId }));
}
export function rejectAiProposal(proposalId: string): Promise<AiProposal> {
  return apiFetch(`${AI_API}/proposals/${proposalId}/reject`, { method: "POST" });
}

export type AiFailure = "offline" | "access" | "limit" | "notConfigured" | "timeout" | "contextMissing" | "unavailable";

/** A stable reason for the user; never the provider's body. */
export function classifyAiFailure(error: unknown): AiFailure {
  if (error instanceof NetworkError) return "offline";
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403 || error.status === 404) return "access";
    if (error.status === 429 || error.body.includes("AI_PROVIDER_LIMIT")) return "limit";
    if (error.body.includes("AI_NOT_CONFIGURED")) return "notConfigured";
    if (error.body.includes("AI_PROVIDER_TIMEOUT") || error.body.includes("AI_DEADLINE")) return "timeout";
  }
  return "unavailable";
}

export function taskFailure(task: AiTask): AiFailure {
  const code = task.error_code ?? "";
  return code === "AI_PROVIDER_LIMIT" ? "limit" : code === "AI_PROVIDER_TIMEOUT" || code === "AI_DEADLINE" ? "timeout" :
    code === "AI_ACCESS_CHANGED" ? "access" : code === "AI_CONTEXT_NOT_FOUND" ? "contextMissing" : "unavailable";
}

/** Rows of the before/after preview; identical values are marked unchanged. */
export function proposalRows(preview: AiProposal["preview"]): { key: string; before: unknown; after: unknown; changed: boolean }[] {
  const before = preview.before ?? {};
  const after = preview.after ?? {};
  return Array.from(new Set([...Object.keys(after), ...Object.keys(before)]))
    .filter((key) => !(before[key] == null && after[key] == null))
    .map((key) => ({ key, before: before[key], after: after[key], changed: JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null) }));
}

/** The route of a server-built source inside the app (the server never sends app routes). */
export function sourceRoute(source: AiSource, context: { projectId?: string | null } = {}): string | null {
  if (source.kind === "project") return `/project/${encodeURIComponent(source.id)}`;
  if (source.kind === "issue") {
    const projectId = /project_id=([0-9a-f-]{36})/i.exec(source.path)?.[1] ?? context.projectId;
    return `/issues?${projectId ? `projectId=${encodeURIComponent(projectId)}&` : ""}issueId=${encodeURIComponent(source.id)}`;
  }
  if (source.kind === "door") {
    const projectId = /projects\/([0-9a-f-]{36})/i.exec(source.path)?.[1] ?? context.projectId;
    return projectId ? `/project/${encodeURIComponent(projectId)}?doorId=${encodeURIComponent(source.id)}` : null;
  }
  return null;
}

type Tri = { en: string; ru: string; he: string };
const tri = (en: string, ru: string, he: string): Tri => ({ en, ru, he });

export const AI_COPY = {
  title: tri("DIMAX AI", "DIMAX AI", "DIMAX AI"),
  eyebrow: tri("ASSISTANT / MY POSITIONS", "ПОМОЩНИК / МОИ ПОЗИЦИИ", "עוזר / הפריטים שלי"),
  subtitle: tri("Your positions and issues. Reports are proposals you confirm; installation is confirmed in the app as before.",
    "Ваши позиции и замечания. Отчёты — это предложения, которые вы подтверждаете; монтаж подтверждается в приложении как раньше.",
    "הפריטים והליקויים שלך. דיווחים הם הצעות שאתה מאשר; ההתקנה מאושרת באפליקציה כמו קודם."),
  question: tri("Your question or task", "Вопрос или задача", "שאלה או משימה"),
  ask: tri("Ask DIMAX AI", "Спросить DIMAX AI", "שאל את DIMAX AI"),
  working: tri("Checking records…", "Проверяю записи…", "בודק רשומות…"),
  examples: [
    tri("Which of my positions are not finished?", "Какие мои позиции не завершены?", "אילו מהפריטים שלי לא הושלמו?"),
    tri("What is open on my issues?", "Что открыто по моим замечаниям?", "מה פתוח בליקויים שלי?"),
    tri("Report an obstacle on a position", "Записать препятствие по позиции", "לרשום מכשול על פריט"),
  ],
  context: tri("Selected object", "Выбранный объект", "אובייקט נבחר"),
  contextKinds: { project: tri("Project", "Объект", "פרויקט"), door: tri("Position", "Позиция", "פריט"), issue: tri("Issue", "Замечание", "ליקוי") },
  clear: tri("Clear", "Сбросить", "נקה"),
  providerMock: tri("Demo provider: no real model is connected; answers are built from system records.",
    "Демо-провайдер: реальная модель не подключена; ответы собираются по записям системы.",
    "ספק הדגמה: מודל אמיתי אינו מחובר; התשובות נבנות מרשומות המערכת."),
  actionsOn: tri("Reports as proposals you confirm", "Отчёты как предложения, которые вы подтверждаете", "דיווחים כהצעות שאתה מאשר"),
  actionsOff: tri("Reads only", "Только чтение", "קריאה בלבד"),
  offline: tri("No connection. DIMAX AI needs the network; your door actions still queue offline as before.",
    "Нет связи. DIMAX AI нужна сеть; действия по дверям по-прежнему копятся в очереди офлайн.",
    "אין חיבור. DIMAX AI צריך רשת; פעולות הדלתות עדיין נצברות בתור במצב לא מקוון."),
  openQueue: tri("Open sync queue", "Открыть очередь", "פתח תור סנכרון"),
  retry: tri("Try again", "Повторить", "נסה שוב"),
  failures: {
    offline: tri("No connection.", "Нет связи.", "אין חיבור."),
    access: tri("DIMAX AI is unavailable for this account.", "DIMAX AI недоступен для этой учётной записи.", "DIMAX AI אינו זמין לחשבון זה."),
    limit: tri("Request limit reached. Try later.", "Достигнут лимит запросов. Попробуйте позже.", "הגעת למגבלת הבקשות. נסה מאוחר יותר."),
    notConfigured: tri("DIMAX AI is not connected yet.", "DIMAX AI пока не подключён.", "DIMAX AI עדיין לא מחובר."),
    timeout: tri("The request took too long.", "Запрос занял слишком много времени.", "הבקשה ארכה זמן רב מדי."),
    contextMissing: tri("The selected object is no longer available to you. Clear it and ask again.",
      "Выбранный объект вам больше недоступен. Сбросьте его и спросите снова.", "האובייקט שנבחר אינו זמין לך יותר. נקה אותו ושאל שוב."),
    unavailable: tri("DIMAX AI could not answer.", "DIMAX AI не смог ответить.", "DIMAX AI לא הצליח לענות."),
  },
  disabled: tri("DIMAX AI is switched off.", "DIMAX AI выключен.", "DIMAX AI כבוי."),
  answer: tri("Answer", "Ответ", "תשובה"),
  sources: tri("Source records", "Записи-источники", "רשומות מקור"),
  steps: tri("tool calls", "вызовов инструментов", "קריאות כלים"),
  proposal: {
    title: tri("Proposed action", "Предлагаемое действие", "פעולה מוצעת"),
    before: tri("Now", "Сейчас", "עכשיו"), after: tri("After confirmation", "После подтверждения", "אחרי האישור"),
    review: tri("Review and confirm", "Проверить и подтвердить", "בדוק ואשר"),
    confirm: tri("Confirm", "Подтвердить", "אשר"), reject: tri("Reject", "Отклонить", "דחה"), cancel: tri("Back", "Назад", "חזרה"),
    dialog: tri("Your report is saved once with the values shown. The position is re-read first; if it changed, nothing is saved. Installation facts and earnings are not changed.",
      "Ваш отчёт сохраняется один раз с показанными значениями. Позиция сначала перечитывается; если она изменилась, ничего не сохраняется. Факты монтажа и начисления не меняются.",
      "הדיווח שלך נשמר פעם אחת עם הערכים המוצגים. הפריט נקרא מחדש קודם; אם השתנה, דבר לא נשמר. עובדות ההתקנה והצבירות אינן משתנות."),
    status: {
      PROPOSED: tri("Waiting for your decision", "Ждёт вашего решения", "ממתין להחלטתך"),
      CONFIRMED: tri("Saving…", "Сохраняю…", "שומר…"),
      EXECUTED: tri("Saved and verified", "Сохранено и проверено", "נשמר ואומת"),
      REJECTED: tri("Rejected, nothing saved", "Отклонено, ничего не сохранено", "נדחה, דבר לא נשמר"),
      EXPIRED: tri("Expired: ask again", "Срок истёк: спросите снова", "פג תוקף: שאל שוב"),
      FAILED: tri("Could not be saved", "Не удалось сохранить", "לא ניתן היה לשמור"),
      CONFLICT: tri("The record changed after the preview. Ask again.", "Запись изменилась после предпросмотра. Спросите снова.", "הרשומה השתנתה אחרי התצוגה המקדימה. שאל שוב."),
    } as Record<AiProposalStatus, Tri>,
    decisionLost: tri("Connection lost. Confirm again: the same decision is reused, nothing is saved twice.",
      "Связь прервалась. Подтвердите снова: решение переиспользуется, ничего не сохраняется дважды.",
      "החיבור אבד. אשר שוב: אותה החלטה נעשה בה שימוש, דבר לא נשמר פעמיים."),
    open: tri("Open record", "Открыть запись", "פתח רשומה"),
  },
  fields: {
    door_status: tri("Position status", "Статус позиции", "סטטוס הפריט"), issue_status: tri("Issue status", "Статус замечания", "סטטוס הליקוי"),
    issue_title: tri("Issue title", "Название замечания", "כותרת הליקוי"), title: tri("Title", "Название", "כותרת"),
    details: tri("Details", "Описание", "פירוט"), workflow_state: tri("Workflow", "Ход работы", "מהלך"),
    comment: tri("Comment", "Комментарий", "תגובה"), priority: tri("Priority", "Приоритет", "עדיפות"),
  } as Record<string, Tri>,
  values: {
    OPEN: tri("Open", "Открыто", "פתוח"), CLOSED: tri("Closed", "Закрыто", "סגור"), NEW: tri("New", "Новое", "חדש"),
    IN_PROGRESS: tri("In progress", "В работе", "בתהליך"), BLOCKED: tri("Blocked", "Заблокировано", "חסום"),
    NOT_INSTALLED: tri("Not installed", "Не установлена", "לא הותקן"), INSTALLED: tri("Installed", "Установлена", "הותקן"),
    ISSUE_OPEN: tri("Issue open", "Открыто замечание", "ליקוי פתוח"), LOCKED: tri("Locked", "Заблокирована", "נעול"),
    CANCELLED: tri("Cancelled", "Отменена", "בוטל"),
  } as Record<string, Tri>,
  unchanged: tri("unchanged", "без изменений", "ללא שינוי"),
  empty: tri("Ask about your positions or issues. Answers use the records assigned to you.",
    "Спросите о своих позициях или замечаниях. Ответы основаны на записях, назначенных вам.",
    "שאל על הפריטים או הליקויים שלך. התשובות מבוססות על הרשומות שהוקצו לך."),
  newConversation: tri("New conversation", "Новый диалог", "שיחה חדשה"),
  history: tri("Recent conversations", "Недавние диалоги", "שיחות אחרונות"),
};

export function pick(locale: MobileLocale, value: Tri): string {
  return value[locale] ?? value.en;
}

export function previewValue(locale: MobileLocale, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return AI_COPY.values[value] ? pick(locale, AI_COPY.values[value]) : value;
  return String(value);
}
