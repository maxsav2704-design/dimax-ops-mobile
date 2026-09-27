import { NetworkError } from "../src/lib/errors";
import type { ProjectListItem } from "../src/modules/projects/types";

// Used only by the loopback Vite preview; never reads or writes SQLite or API data.
export type HomePreviewMode = "online" | "cache" | "unavailable" | "empty";
let mode: HomePreviewMode = "online";
export const getHomePreviewMode = () => mode;
export function setHomePreviewMode(value: HomePreviewMode) { mode = value; }
const projects: ProjectListItem[] = [
  { id: "preview-project", name: "DIMAX / Residential Tower A", address: "14 Herzl, Ashdod / Building A, entrance 2", status: "ACTIVE", lifecycle_status: "ACTIVE", health_status: "AT_RISK", waze_url: "https://waze.com/ul?q=Ashdod" },
  { id: "preview-tower-b", name: "DIMAX / North Quarter / Technical and fire doors", address: "88 Test Avenue, building B", status: "ACTIVE", lifecycle_status: "ACTIVE", health_status: "NORMAL", waze_url: null },
  { id: "preview-completed", name: "DIMAX / Completed building C", address: null, status: "COMPLETED", lifecycle_status: "COMPLETED", health_status: "NORMAL", waze_url: null },
];
export async function listProjects() {
  const requested = mode;
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (requested === "unavailable") throw new Error("TEST: local assignments unavailable");
  return requested === "empty" ? [] : structuredClone(projects);
}
export async function listProjectDoors(projectId: string) {
  return Array.from({ length: projectId === "preview-project" ? 8 : 4 }, (_, index) => ({
    id: `${projectId}-door-${index}`, status: projectId === "preview-completed" || index < 2 ? "INSTALLED" : "PENDING",
  }));
}
export async function listProjectIssues(projectId: string) {
  return projectId === "preview-project" ? [{ id: "preview-issue", status: "OPEN" }] : [];
}
export async function getLastSyncAt() { return new Date(Date.now() - 3600000).toISOString(); }
export async function getSyncQueueSummary() {
  const pending = mode === "cache" ? 2 : 0;
  return { total: pending, pending, failed: 0, blocked: 0, ready_to_send: pending, next_retry_at: null };
}
export async function syncHomePreview() {
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (mode === "cache" || mode === "unavailable") throw new NetworkError("TEST: offline");
  return { server_time: new Date().toISOString() };
}
export const forceColdResync = syncHomePreview;
export const canUseProjectCacheAfterSyncFailure = (error: unknown, count: number) => error instanceof NetworkError && count > 0;
