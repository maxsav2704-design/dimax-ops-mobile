import { queueIssueCreateEvent } from "@/modules/sync/service";
import { captureWorkspaceContext, withWorkspaceDatabase } from "@/lib/workspace-context";

/** Same guard as door and add-on actions: the write waits for sync/account activation. */
export async function createIssue(input: Parameters<typeof queueIssueCreateEvent>[0]) {
  return withWorkspaceDatabase(captureWorkspaceContext(), () => queueIssueCreateEvent(input));
}
