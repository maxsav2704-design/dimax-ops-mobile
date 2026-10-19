// Route helpers of the DIMAX AI screen; no API import so any screen can link here.
export type AiContextKind = "project" | "door" | "issue";
export type AiContext = { kind: AiContextKind; id: string };

/** Route into the AI screen from a section: the object becomes the context, the question is prefilled. */
export function buildAiRoute(input: { projectId?: string | null; doorId?: string | null; issueId?: string | null; question?: string } = {}): string {
  const params = new URLSearchParams();
  if (input.issueId) params.set("context", `issue:${input.issueId}`);
  else if (input.doorId) params.set("context", `door:${input.doorId}`);
  else if (input.projectId) params.set("context", `project:${input.projectId}`);
  if (input.question) params.set("q", input.question);
  const query = params.toString();
  return query ? `/ai?${query}` : "/ai";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAiContext(value: string | string[] | null | undefined): AiContext | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  return (kind === "project" || kind === "door" || kind === "issue") && id && UUID.test(id) ? { kind, id } : null;
}
