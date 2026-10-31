import { ApiError, NetworkError, RequestTimeoutError } from "@/lib/errors";

export const MAX_AUTO_RETRY_ATTEMPTS = 8;
export const AUTO_RETRY_LIMIT_SUFFIX = "(auto retry limit reached)";

/** No connection at all: the request never reached the server, so it is not a failed delivery. */
export function isOfflineSyncError(error: unknown): boolean {
  return error instanceof NetworkError && !(error instanceof RequestTimeoutError);
}

/** The server refused the person (switched off, role changed), not the work: the work waits for a fresh sign-in. */
export function isAccountRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function computeRetryDelayMinutes(attempts: number): number {
  if (attempts <= 1) return 1;
  if (attempts === 2) return 3;
  if (attempts === 3) return 10;
  if (attempts === 4) return 30;
  return 60;
}

export function isRetryableSyncError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof ApiError) {
    // 429 is a "slow down", not a rejection of the queued work.
    return error.status === 401 || error.status === 429 || error.status >= 500;
  }
  return false;
}

export function getSyncErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Sync failed";
}
