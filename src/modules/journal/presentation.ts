import type { InstallerJournalSummary } from "./types";
import type { JournalWorkspace } from "./workspace";

export function journalGroups(workspace: JournalWorkspace, filter: "ALL" | InstallerJournalSummary["status"]) {
  const groups = new Map(workspace.projects.map((project) => [project.id, { project, journals: [] as InstallerJournalSummary[] }]));
  for (const journal of workspace.journals) {
    let group = groups.get(journal.project_id);
    if (!group) {
      group = { project: { id: journal.project_id, name: journal.project_name, address: journal.project_address, installedLocally: null }, journals: [] };
      groups.set(journal.project_id, group);
    }
    group.journals.push(journal);
  }
  const rank = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 };
  return [...groups.values()].map((group) => ({ ...group,
    journals: group.journals.filter((item) => filter === "ALL" || item.status === filter)
      .sort((a, b) => rank[a.status] - rank[b.status] || (b.signed_at || "").localeCompare(a.signed_at || "") || a.id.localeCompare(b.id)),
  })).filter((group) => filter === "ALL" || group.journals.length > 0)
    .sort((a, b) => a.project.name.localeCompare(b.project.name));
}
