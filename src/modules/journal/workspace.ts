import { assertWorkspaceContext, captureWorkspaceContext, withWorkspaceDatabase } from "@/lib/workspace-context";
import { listProjectDoors, listProjects } from "@/modules/projects/repository";
import { SessionChangedError } from "@/lib/errors";
import { loadInstallerJournals } from "./service";
import type { JournalLoadResult, InstallerJournalSummary } from "./types";

export type JournalProject = { id: string; name: string; address: string | null; installedLocally: number | null };
export type JournalWorkspace = { projects: JournalProject[]; journals: InstallerJournalSummary[]; localUnavailable: boolean };

export async function loadJournalWorkspace(): Promise<JournalLoadResult<JournalWorkspace>> {
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  let localUnavailable = false;
  let projects: JournalProject[] = [];
  try {
    projects = await withWorkspaceDatabase(context, async () => {
      const items = await listProjects();
      const result: JournalProject[] = [];
      for (const item of items) {
        const doors = await listProjectDoors(item.id);
        result.push({ id: item.id, name: item.name, address: item.address, installedLocally: doors.filter((door) => door.status === "INSTALLED").length });
      }
      return result;
    });
  } catch (error) {
    if (error instanceof SessionChangedError) throw error;
    localUnavailable = true;
  }
  const loaded = await loadInstallerJournals();
  assertWorkspaceContext(context);
  return { ...loaded, data: { projects, journals: loaded.data, localUnavailable } };
}
