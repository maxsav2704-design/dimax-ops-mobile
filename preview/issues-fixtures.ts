import type { InstallerDoor, ProjectIssue, ProjectListItem } from "../src/modules/projects/types";
type Mode = "online" | "cache" | "unavailable" | "empty";
let mode: Mode = "online";
let failNext = false;
let pending = 0;
let issues: ProjectIssue[] = [];
const projects: ProjectListItem[] = [{ id: "preview-project", name: "DIMAX / North Quarter / Entrance and technical doors", address: "Test address", status: "ACTIVE", lifecycle_status: "ACTIVE", health_status: "AT_RISK", waze_url: null }];
const doors: InstallerDoor[] = ["201", "202", "301"].map((apartment) => ({ id: `door-${apartment}`, project_id: "preview-project", unit_label: `A-${apartment[0]}-${apartment}-ENTRANCE-DOOR-01`, door_type_id: "entrance", order_number: "ORD-24", house_number: "A", floor_label: apartment[0], apartment_number: apartment, location_code: "ENTRANCE", door_marking: "D1", status: "PENDING", reason_id: null, comment: null, is_locked: false, version: 1, updated_at: null }));
export function resetIssuesPreview(value: Mode) {
  mode = value; pending = value === "cache" ? 1 : 0; failNext = false;
  issues = value === "empty" ? [] : [
    { id: "issue-201", project_id: "preview-project", door_id: "door-201", status: "OPEN", title: "Damaged frame / Повреждение дверной коробки / משקוף פגום", details: "The upper corner of the frame is bent. Installation is paused until the office confirms the replacement. / Верхний угол коробки погнут. Нужна замена детали перед монтажом. / הפינה העליונה של המשקוף עקומה. נדרשת החלפה לפני ההתקנה." },
    { id: value === "cache" ? "local:issue-202" : "issue-202", project_id: "preview-project", door_id: "door-202", status: "IN_PROGRESS", title: "Access / Доступ / גישה", details: "TEST: the apartment is locked." },
    { id: "issue-301", project_id: "preview-project", door_id: "door-301", status: "CLOSED", title: "Handle replaced / Ручка заменена / הידית הוחלפה", details: "TEST: closed by the office." },
  ];
}
resetIssuesPreview("online");
export function failNextIssueSave() { failNext = true; }
export async function listProjects() {
  const unavailable = mode === "unavailable";
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (unavailable) throw Error("TEST: local issue data unavailable");
  return structuredClone(projects);
}
export async function listProjectDoors() { return structuredClone(doors); }
export async function listProjectIssues() { return structuredClone(issues); }
export async function getSyncQueueSummary() { return { total: pending, pending, failed: 0, blocked: 0, ready_to_send: pending, next_retry_at: null }; }
export async function queueIssueCreateEvent(input: { projectId: string; doorId: string; title?: string | null; details?: string | null }) {
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (failNext) { failNext = false; throw Error("TEST: local save failed; draft retained"); }
  if (!doors.some((door) => door.project_id === input.projectId && door.id === input.doorId)) throw Error("TEST: invalid assignment");
  pending++;
  issues.unshift({ id: `local:test-${issues.length}`, project_id: input.projectId, door_id: input.doorId, status: "OPEN", title: input.title || null, details: input.details || null });
}
export async function syncIssuesPreview() {
  if (mode === "cache") throw Error("TEST: offline");
  pending = 0;
  issues = issues.map((issue) => ({ ...issue, id: issue.id.replace(/^local:/, "synced:") }));
}
