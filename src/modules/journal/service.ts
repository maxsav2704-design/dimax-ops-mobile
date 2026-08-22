import * as Linking from "expo-linking";

import { apiFetch } from "@/lib/api";
import { NetworkError } from "@/lib/errors";
import {
  getJournalSnapshot,
  listJournalSnapshots,
  saveJournalSnapshot,
  saveJournalSnapshots,
} from "@/modules/journal/repository";
import type {
  InstallerJournalDetails,
  InstallerJournalSummary,
  JournalLoadResult,
  JournalMarkReadyResponse,
  JournalPdfLinkResponse,
} from "@/modules/journal/types";

function assertHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Journal link must use HTTP or HTTPS");
  }
  return url.toString();
}

export async function loadInstallerJournals(): Promise<
  JournalLoadResult<InstallerJournalSummary[]>
> {
  try {
    const response = await apiFetch<{ items: InstallerJournalSummary[] }>(
      "/api/v1/installer/journals",
    );
    try {
      await saveJournalSnapshots(response.items);
      return { data: response.items, source: "online", message: null };
    } catch {
      return {
        data: response.items,
        source: "online",
        message:
          "Fresh journal loaded, but its offline copy could not be saved.",
      };
    }
  } catch (error) {
    const cached = await listJournalSnapshots();
    if (cached.length) {
      return {
        data: cached,
        source: "cache",
        message:
          error instanceof NetworkError
            ? "Showing the last saved journal while offline."
            : "Showing the last saved journal.",
      };
    }
    throw error;
  }
}

export async function loadInstallerJournal(
  journalId: string,
): Promise<JournalLoadResult<InstallerJournalDetails>> {
  try {
    const details = await apiFetch<InstallerJournalDetails>(
      `/api/v1/installer/journals/${encodeURIComponent(journalId)}`,
    );
    try {
      await saveJournalSnapshot(details);
      return { data: details, source: "online", message: null };
    } catch {
      return {
        data: details,
        source: "online",
        message:
          "Fresh document loaded, but its offline copy could not be saved.",
      };
    }
  } catch (error) {
    const cached = await getJournalSnapshot(journalId);
    if (cached) {
      return {
        data: cached,
        source: "cache",
        message:
          error instanceof NetworkError
            ? "Showing the saved acceptance document while offline."
            : "Showing the saved acceptance document.",
      };
    }
    throw error;
  }
}

export async function prepareInstallerJournal(
  projectId: string,
): Promise<InstallerJournalDetails> {
  const details = await apiFetch<InstallerJournalDetails>(
    "/api/v1/installer/journals/prepare",
    { method: "POST", body: JSON.stringify({ project_id: projectId }) },
  );
  await saveJournalSnapshot(details).catch(() => undefined);
  return details;
}

export async function refreshInstallerJournal(
  journalId: string,
): Promise<InstallerJournalDetails> {
  const details = await apiFetch<InstallerJournalDetails>(
    `/api/v1/installer/journals/${encodeURIComponent(journalId)}/refresh`,
    { method: "POST" },
  );
  await saveJournalSnapshot(details).catch(() => undefined);
  return details;
}

export async function markInstallerJournalReady(
  journalId: string,
): Promise<JournalMarkReadyResponse> {
  return apiFetch<JournalMarkReadyResponse>(
    `/api/v1/installer/journals/${encodeURIComponent(journalId)}/mark-ready`,
    { method: "POST" },
  );
}

export async function openJournalUrl(value: string): Promise<void> {
  await Linking.openURL(assertHttpUrl(value));
}

export async function openSignedJournalPdf(journalId: string): Promise<void> {
  const response = await apiFetch<JournalPdfLinkResponse>(
    `/api/v1/installer/journals/${encodeURIComponent(journalId)}/pdf-link`,
    { method: "POST" },
  );
  await openJournalUrl(response.url);
}
