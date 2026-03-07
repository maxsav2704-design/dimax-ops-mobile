import { ApiError, NetworkError } from "@/lib/errors";

export const MAX_AUTO_RETRY_ATTEMPTS = 8;

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
    return error.status === 401 || error.status >= 500;
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
