import * as Linking from "expo-linking";

import { apiFetch } from "@/lib/api";
import { NetworkError, SessionChangedError } from "@/lib/errors";
import { assertWorkspaceContext, captureWorkspaceContext, withWorkspaceDatabase } from "@/lib/workspace-context";
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
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  try {
    const response = await apiFetch<{ items: InstallerJournalSummary[] }>(
      "/api/v1/installer/journals",
      { expectedAuthGeneration: context.authGeneration },
    );
    try {
      await withWorkspaceDatabase(context, () => saveJournalSnapshots(response.items));
      assertWorkspaceContext(context);
      return { data: response.items, source: "online", message: null };
    } catch (error) {
      assertWorkspaceContext(context);
      if (error instanceof SessionChangedError) throw error;
      return {
        data: response.items,
        source: "online",
        message:
          "Fresh journal loaded, but its offline copy could not be saved.",
      };
    }
  } catch (error) {
    assertWorkspaceContext(context);
    if (error instanceof SessionChangedError) throw error;
    const cached = await withWorkspaceDatabase(context, () => listJournalSnapshots());
    assertWorkspaceContext(context);
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
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  try {
    const details = await apiFetch<InstallerJournalDetails>(
      `/api/v1/installer/journals/${encodeURIComponent(journalId)}`,
      { expectedAuthGeneration: context.authGeneration },
    );
    try {
      await withWorkspaceDatabase(context, () => saveJournalSnapshot(details));
      assertWorkspaceContext(context);
      return { data: details, source: "online", message: null };
    } catch (error) {
      assertWorkspaceContext(context);
      if (error instanceof SessionChangedError) throw error;
      return {
        data: details,
        source: "online",
        message:
          "Fresh document loaded, but its offline copy could not be saved.",
      };
    }
  } catch (error) {
    assertWorkspaceContext(context);
    if (error instanceof SessionChangedError) throw error;
    const cached = await withWorkspaceDatabase(context, () => getJournalSnapshot(journalId));
    assertWorkspaceContext(context);
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
  pdfLocale: "en" | "ru" | "he" = "en",
): Promise<InstallerJournalDetails> {
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  const details = await apiFetch<InstallerJournalDetails>(
    "/api/v1/installer/journals/prepare",
    { method: "POST", body: JSON.stringify({ project_id: projectId, pdf_locale: pdfLocale }), expectedAuthGeneration: context.authGeneration },
  );
  await withWorkspaceDatabase(context, () => saveJournalSnapshot(details)).catch((error: unknown) => {
    if (error instanceof SessionChangedError) throw error;
  });
  assertWorkspaceContext(context);
  return details;
}

export async function refreshInstallerJournal(
  journalId: string,
): Promise<InstallerJournalDetails> {
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  const details = await apiFetch<InstallerJournalDetails>(
    `/api/v1/installer/journals/${encodeURIComponent(journalId)}/refresh`,
    { method: "POST", expectedAuthGeneration: context.authGeneration },
  );
  await withWorkspaceDatabase(context, () => saveJournalSnapshot(details)).catch((error: unknown) => {
    if (error instanceof SessionChangedError) throw error;
  });
  assertWorkspaceContext(context);
  return details;
}

export async function markInstallerJournalReady(
  journalId: string,
): Promise<JournalMarkReadyResponse> {
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  const response = await apiFetch<JournalMarkReadyResponse>(
    `/api/v1/installer/journals/${encodeURIComponent(journalId)}/mark-ready`,
    { method: "POST", expectedAuthGeneration: context.authGeneration },
  );
  assertWorkspaceContext(context);
  return response;
}

export async function openJournalUrl(value: string): Promise<void> {
  await Linking.openURL(assertHttpUrl(value));
}

export async function openSignedJournalPdf(journalId: string): Promise<void> {
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  const response = await apiFetch<JournalPdfLinkResponse>(
    `/api/v1/installer/journals/${encodeURIComponent(journalId)}/pdf-link`,
    { method: "POST", expectedAuthGeneration: context.authGeneration },
  );
  assertWorkspaceContext(context);
  await openJournalUrl(response.url);
}
