import { queueIssueCreateEvent, queueIssueFixReportEvent } from "@/modules/sync/service";
import { captureWorkspaceContext, withWorkspaceDatabase } from "@/lib/workspace-context";

/** Same guard as door and add-on actions: the write waits for sync/account activation. */
export async function createIssue(input: Parameters<typeof queueIssueCreateEvent>[0]) {
  return withWorkspaceDatabase(captureWorkspaceContext(), () => queueIssueCreateEvent(input));
}

/** "Fixed, please check": queued offline, confirmed by the office or the site representative, never paid by itself. */
export async function reportIssueFixed(input: Parameters<typeof queueIssueFixReportEvent>[0]) {
  return withWorkspaceDatabase(captureWorkspaceContext(), () => queueIssueFixReportEvent(input));
}
