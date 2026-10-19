import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  locale: "ru", user: { id: "u", company_id: "c" }, params: {} as Record<string, string>, push: vi.fn(), back: vi.fn(),
  api: vi.fn(),
}));
vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({ default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("expo-router", () => ({ router: { push: mocks.push, back: mocks.back }, useLocalSearchParams: () => mocks.params }));
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.locale }), useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/api", () => ({ apiFetch: mocks.api }));

import { ApiError, NetworkError } from "@/lib/errors";
import AiScreen from "../../../app/ai";

const PROJECT = "1f16d537-5617-4c4b-a944-dafba2bcead9";
const proposal = {
  id: "prop-1", task_id: "run-1", tool_name: "propose_my_issue_report", status: "PROPOSED",
  preview: { entity: { kind: "door", id: "d1", label: "M-1", path: `/installer/projects/${PROJECT}` }, summary: { project: "My Project", door: "M-1", mode: "new" },
    before: { door_status: "NOT_INSTALLED", issue_status: null }, after: { door_status: "ISSUE_OPEN", issue_status: "OPEN", title: "Нет доступа" } },
  result: null, error_code: null, expires_at: "2026-10-19T10:00:00Z",
};
const task = {
  id: "run-1", conversation_id: "conv-1", message: "Нет доступа на M-1, запиши замечание", context: { kind: "project", id: PROJECT },
  status: "COMPLETED", error_code: null, created_at: "2026-10-19T09:00:00Z", proposals: [proposal],
  reply: { answer: "Подготовлено предложение; ничего не сохранено.", sources: [{ kind: "project", id: PROJECT, label: "My Project", path: `/installer/projects/${PROJECT}` }],
    tools_used: ["my_project_summary", "my_project_doors", "propose_my_issue_report"], steps: [{ tool: "my_project_summary", ok: true, ms: 5 }], provider: "mock" },
};
const ready = { ready: true, reason: "ready", tools: ["my_projects"], provider: "mock", actions_enabled: true, real_model_verified: false };

function byTestId(root: ReactTestInstance, id: string) { return root.findAll((node) => typeof node.type === "string" && node.props.testID === id); }
function text(node: ReactTestInstance): string {
  return node.findAll((child) => typeof child.type === "string" && child.type === "text")
    .map((child) => React.Children.toArray(child.props.children).join("")).join(" ");
}

let renderer: ReactTestRenderer;
afterEach(() => { renderer?.unmount(); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {}; mocks.locale = "ru";
  mocks.api.mockImplementation(async (path: string) => {
    if (path.endsWith("/ai/status")) return ready;
    if (path.includes("/ai/conversations?")) return { items: [] };
    if (path.includes("/tasks")) return task;
    return {};
  });
});

async function mount() {
  await act(async () => { renderer = create(React.createElement(AiScreen)); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return renderer.root;
}

describe("installer DIMAX AI screen", () => {
  it("talks to the installer API only and sends the deep-link context with the question", async () => {
    mocks.params = { context: `project:${PROJECT}`, q: "Нет доступа на M-1, запиши замечание" };
    const root = await mount();
    expect(byTestId(root, "ai-context")).toHaveLength(1);
    expect(byTestId(root, "ai-question")[0].props.value).toBe("Нет доступа на M-1, запиши замечание");
    await act(async () => { byTestId(root, "ai-ask")[0].props.onPress(); });
    await act(async () => { await Promise.resolve(); });
    const posts = mocks.api.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("/api/v1/installer/ai/tasks");
    expect(JSON.parse(posts[0][1].body)).toMatchObject({ conversation_id: null, locale: "ru", context: { kind: "project", id: PROJECT } });
    expect(mocks.api.mock.calls.every(([path]) => String(path).startsWith("/api/v1/installer/ai"))).toBe(true);
    expect(text(byTestId(root, "ai-answer")[0])).toContain("Подготовлено предложение");
    expect(byTestId(root, "ai-proposal")).toHaveLength(1);
    expect(text(byTestId(root, "ai-proposal")[0])).toContain("Открыто замечание");
    expect(text(byTestId(root, "ai-status")[0])).toContain("Демо-провайдер");
  });

  it("confirms a proposal once with a stable decision token after a lost response", async () => {
    mocks.params = { context: `project:${PROJECT}`, q: "x" };
    let confirms = 0;
    mocks.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path.endsWith("/ai/status")) return ready;
      if (path.includes("/ai/conversations?")) return { items: [] };
      if (path.endsWith("/confirm")) {
        confirms += 1;
        if (confirms === 1) throw new NetworkError();
        return { ...proposal, status: "EXECUTED", result: { result: { issue_status: "OPEN" }, sources: [{ kind: "issue", id: "i1", label: "Нет доступа", path: `/installer/issues?project_id=${PROJECT}&issue_id=i1` }] } };
      }
      if (init?.method === "POST") return task;
      return {};
    });
    const root = await mount();
    await act(async () => { byTestId(root, "ai-ask")[0].props.onPress(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { byTestId(root, "ai-proposal-review")[0].props.onPress(); });
    const dialog = root.findAll((node) => String(node.type) === "modal")[0];
    expect(dialog.props.visible).toBe(true);
    const confirmButton = dialog.findAll((node) => node.props.accessibilityRole === "button" && text(node).includes("Подтвердить"))[0];
    await act(async () => { confirmButton.props.onPress(); });
    await act(async () => { await Promise.resolve(); });
    expect(text(byTestId(root, "ai-error")[0])).toContain("Связь прервалась");
    await act(async () => { byTestId(root, "ai-proposal-review")[0].props.onPress(); });
    const again = root.findAll((node) => String(node.type) === "modal")[0]
      .findAll((node) => node.props.accessibilityRole === "button" && text(node).includes("Подтвердить"))[0];
    await act(async () => { again.props.onPress(); });
    await act(async () => { await Promise.resolve(); });
    const sent = mocks.api.mock.calls.filter(([path]) => String(path).endsWith("/confirm"));
    expect(sent).toHaveLength(2);
    expect(sent[0][1].body).toBe(sent[1][1].body);
    expect(JSON.parse(sent[0][1].body).request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(text(byTestId(root, "ai-proposal")[0])).toContain("Сохранено и проверено");
    expect(byTestId(root, "ai-proposal-review")).toHaveLength(0);
  });

  it("shows the offline state with the queue shortcut and keeps nothing pending", async () => {
    mocks.api.mockImplementation(async () => { throw new NetworkError(); });
    const root = await mount();
    expect(byTestId(root, "ai-offline")).toHaveLength(1);
    expect(byTestId(root, "ai-ask")[0].props.disabled).toBe(true);
    const queue = root.findAll((node) => node.props.accessibilityRole === "button" && text(node).includes("Открыть очередь"))[0];
    await act(async () => { queue.props.onPress(); });
    expect(mocks.push).toHaveBeenCalledWith("/sync-queue");
  });

  it("reports an access failure without provider details and renders Hebrew right-aligned", async () => {
    mocks.locale = "he";
    mocks.api.mockImplementation(async () => { throw new ApiError("x", 403, "private provider body"); });
    const root = await mount();
    expect(text(byTestId(root, "ai-failure")[0])).toContain("אינו זמין");
    expect(text(byTestId(root, "ai-failure")[0])).not.toContain("private");
    expect(byTestId(root, "ai-question")[0].props.style.some((style: { textAlign?: string }) => style?.textAlign === "right")).toBe(true);
  });
});
