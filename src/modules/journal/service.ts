import * as Linking from "expo-linking";

import { apiFetch } from "@/lib/api";
import { ApiError, NetworkError, SessionChangedError } from "@/lib/errors";
import { assertWorkspaceContext, captureWorkspaceContext, withWorkspaceDatabase, type WorkspaceContext } from "@/lib/workspace-context";
import { isJournalDetails, isJournalList } from "./contract";
import {
  getJournalSnapshot,
  listJournalSnapshots,
  saveJournalSnapshot,
  saveJournalSnapshots,
  removeJournalSnapshot,
} from "@/modules/journal/repository";
import type {
  InstallerJournalDetails,
  InstallerJournalSummary,
  JournalLoadResult,
  JournalMarkReadyResponse,
  JournalPdfLinkResponse,
} from "@/modules/journal/types";

let requestSequence = 0;
const savedRequests = new WeakMap<object, number>();

async function saveLatest(context: WorkspaceContext, sequence: number, save: () => Promise<void>) {
  await withWorkspaceDatabase(context, async () => {
    // A list replaces the authorized set; an older detail must not resurrect removed data.
    if ((savedRequests.get(context.database!) || 0) > sequence) return;
    await save();
    savedRequests.set(context.database!, sequence);
  });
}

function deniesAccess(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

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
  const sequence = ++requestSequence;
  try {
    const response = await apiFetch<unknown>(
      "/api/v1/installer/journals",
      { expectedAuthGeneration: context.authGeneration },
    );
    assertWorkspaceContext(context);
    if (!isJournalList(response)) throw new Error("Journal list does not match the mobile contract.");
    try {
      await saveLatest(context, sequence, () => saveJournalSnapshots(response.items));
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
    if (deniesAccess(error)) {
      if (error instanceof ApiError && error.status !== 401) {
        await saveLatest(context, sequence, () => saveJournalSnapshots([])).catch((cacheError: unknown) => {
          if (cacheError instanceof SessionChangedError) throw cacheError;
        });
      }
      throw error;
    }
    const cached = await withWorkspaceDatabase(context, () => listJournalSnapshots());
    assertWorkspaceContext(context);
    if (isJournalList({ items: cached }) && cached.length) {
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
  const sequence = ++requestSequence;
  try {
    const details = await apiFetch<unknown>(
      `/api/v1/installer/journals/${encodeURIComponent(journalId)}`,
      { expectedAuthGeneration: context.authGeneration },
    );
    assertWorkspaceContext(context);
    if (!isJournalDetails(details) || details.id !== journalId) throw new Error("Journal details do not match the mobile contract.");
    try {
      await saveLatest(context, sequence, () => saveJournalSnapshot(details));
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
    if (deniesAccess(error)) {
      if (error instanceof ApiError && error.status !== 401) {
        await saveLatest(context, sequence, () => removeJournalSnapshot(journalId)).catch((cacheError: unknown) => {
          if (cacheError instanceof SessionChangedError) throw cacheError;
        });
      }
      throw error;
    }
    const cached = await withWorkspaceDatabase(context, () => getJournalSnapshot(journalId));
    assertWorkspaceContext(context);
    if (isJournalDetails(cached) && cached.id === journalId) {
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
  const sequence = ++requestSequence;
  const details = await apiFetch<unknown>(
    "/api/v1/installer/journals/prepare",
    { method: "POST", body: JSON.stringify({ project_id: projectId, pdf_locale: pdfLocale }), expectedAuthGeneration: context.authGeneration },
  );
  assertWorkspaceContext(context);
  if (!isJournalDetails(details) || details.project_id !== projectId) throw new Error("Prepared journal does not match the requested project.");
  await saveLatest(context, sequence, () => saveJournalSnapshot(details)).catch((error: unknown) => {
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
  const sequence = ++requestSequence;
  const details = await apiFetch<unknown>(
    `/api/v1/installer/journals/${encodeURIComponent(journalId)}/refresh`,
    { method: "POST", expectedAuthGeneration: context.authGeneration },
  );
  assertWorkspaceContext(context);
  if (!isJournalDetails(details) || details.id !== journalId) throw new Error("Refreshed journal does not match the requested document.");
  await saveLatest(context, sequence, () => saveJournalSnapshot(details)).catch((error: unknown) => {
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
  const sequence = ++requestSequence;
  const response = await apiFetch<JournalMarkReadyResponse>(
    `/api/v1/installer/journals/${encodeURIComponent(journalId)}/mark-ready`,
    { method: "POST", expectedAuthGeneration: context.authGeneration },
  );
  assertWorkspaceContext(context);
  assertHttpUrl(response.signing_url);
  if (!Number.isFinite(Date.parse(response.public_token_expires_at))) throw new Error("Invalid signing link expiration.");
  await saveLatest(context, sequence, async () => {
    const cached = await getJournalSnapshot(journalId);
    if (cached) await saveJournalSnapshot({ ...cached, status: "ACTIVE", can_submit: false, ...response });
  }).catch((error: unknown) => {
    if (error instanceof SessionChangedError) throw error;
  });
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
