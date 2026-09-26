import React, { createContext, useContext, useEffect, useState } from "react";
import type { LocalProjectWorkspace } from "../src/modules/projects/local-workspace";

// Aliased only by the Vite preview. No authentication, network or SQLite access.
const LocaleContext = createContext("ru");
export const PreviewLocaleProvider = LocaleContext.Provider;
export const useI18n = () => ({ locale: useContext(LocaleContext) });
export const useAuth = () => ({ syncVersion: 0 });
export const useLocalSearchParams = () => ({ id: "preview-project" });
export const useFocusEffect = (effect: () => void | (() => void)) => useEffect(effect, [effect]);
export const InstallerBottomNav = () => null;
export function usePreviewDestination() {
  const [path, setPath] = useState("");
  useEffect(() => {
    const changed = () => setPath(window.location.hash.slice(1));
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return path;
}
export const router = {
  push: (path: string) => { window.location.hash = path; },
  back: () => { window.location.hash = "/projects"; },
};
export function createEmptyLocalProjectWorkspace(projectId = ""): LocalProjectWorkspace {
  return { projectId, project: null, doors: [], doorTypes: [], issues: [], reasons: [], addonTypes: [], addonFacts: [], pendingEvents: [], queueSummary: null };
}
let workspace: LocalProjectWorkspace;
let failNext = false;
export function resetPreviewProject() {
  failNext = false;
  workspace = {
    ...createEmptyLocalProjectWorkspace("preview-project"),
    project: { id: "preview-project", name: "DIMAX / A", address: "14 Herzl, Ashdod", status: "ACTIVE", lifecycle_status: "ACTIVE", health_status: "NORMAL", waze_url: null },
    doors: ["201", "202"].map((apartment) => ({
      id: `door-${apartment}`, project_id: "preview-project", door_type_id: "entrance",
      unit_label: `A-2-${apartment}`, floor_label: "2", house_number: "A", apartment_number: apartment,
      order_number: "ORD-24", location_code: "ENTRANCE", door_marking: "D1", status: "PENDING",
      reason_id: null, comment: null, is_locked: false, version: 1, updated_at: null,
    })),
    doorTypes: [{ id: "entrance", code: "ENTRANCE", name: "Entrance / D1" }],
    reasons: [{ id: "no-access", code: "NO_ACCESS", name: "No access / Нет доступа / אין גישה" }],
    addonTypes: [{ id: "adjustment", name: "Adjustment / Регулировка / כיוון", unit: "pcs", qty_planned: "2" }],
    queueSummary: { total: 0, pending: 0, failed: 0, blocked: 0, ready_to_send: 0, next_retry_at: null },
  };
}
resetPreviewProject();
export function failNextPreviewSave() { failNext = true; }
export const loadLocalProjectWorkspace = async () => structuredClone(workspace);
export const canRefreshProjectDetails = (count: number) => count === 0;
export const refreshProjectDetails = async () => undefined;
export const isProjectAccessRevoked = () => false;
export const loadInstallerEarnings = async () => ({ snapshot: null, source: "unavailable", message: null });
export const buildProjectExternalActions = () => [];
export const openProjectExternalAction = async () => undefined;
async function save(type: "DOOR_SET_STATUS" | "ADDON_FACT_CREATE", payload: Record<string, unknown>) {
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (failNext) { failNext = false; throw new Error("TEST: local storage unavailable / локальное хранилище недоступно"); }
  const now = new Date().toISOString();
  workspace.pendingEvents.push({
    client_event_id: `preview-${workspace.pendingEvents.length + 1}`, project_id: "preview-project",
    type, payload, status: "PENDING", error: null, attempts: 0, happened_at: now, created_at: now, next_retry_at: null, last_attempt_at: null,
  });
  workspace.queueSummary = { ...workspace.queueSummary!, total: workspace.pendingEvents.length, pending: workspace.pendingEvents.length, ready_to_send: workspace.pendingEvents.length };
}
export async function markDoorInstalled(_projectId: string, doorId: string) {
  await save("DOOR_SET_STATUS", { door_id: doorId, status: "INSTALLED" });
  workspace.doors = workspace.doors.map((door) => door.id === doorId ? { ...door, status: "INSTALLED", is_locked: true } : door);
}
export async function markDoorNotInstalled(_projectId: string, doorId: string, reasonId: string, comment: string) {
  await save("DOOR_SET_STATUS", { door_id: doorId, status: "NOT_INSTALLED", reason_id: reasonId, comment });
  workspace.doors = workspace.doors.map((door) => door.id === doorId ? { ...door, status: "NOT_INSTALLED", reason_id: reasonId, comment } : door);
}
export async function addAddonFact(projectId: string, addonTypeId: string, qtyDone: string, comment: string) {
  await save("ADDON_FACT_CREATE", { addon_type_id: addonTypeId, qty_done: qtyDone, comment });
  workspace.addonFacts.push({ id: `local:${workspace.pendingEvents.length}`, project_id: projectId, addon_type_id: addonTypeId, addon_name: "Adjustment", unit: "pcs", qty_done: qtyDone, comment, done_at: new Date().toISOString(), source: "OFFLINE", updated_at: null });
}
export async function runSync() {
  await new Promise((resolve) => setTimeout(resolve, 450));
  workspace.pendingEvents = [];
  workspace.queueSummary = { total: 0, pending: 0, failed: 0, blocked: 0, ready_to_send: 0, next_retry_at: null };
}
