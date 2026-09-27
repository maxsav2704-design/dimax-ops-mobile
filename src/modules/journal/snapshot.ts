import type {
  InstallerJournalDetails,
  InstallerJournalSummary,
} from "@/modules/journal/types";

export function mergeJournalSnapshot(
  summary: InstallerJournalSummary,
  existing: InstallerJournalDetails | null,
): InstallerJournalSummary | InstallerJournalDetails {
  if (!existing || existing.status !== summary.status ||
      existing.completed_doors !== summary.completed_doors ||
      existing.completed_addons !== summary.completed_addons) return summary;
  return { ...existing, ...summary };
}
