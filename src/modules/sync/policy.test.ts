import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "@/lib/errors";
import {
  MAX_AUTO_RETRY_ATTEMPTS,
  computeRetryDelayMinutes,
  getSyncErrorMessage,
  isRetryableSyncError,
} from "@/modules/sync/policy";

describe("sync retry policy", () => {
  it("uses escalating retry delays", () => {
    expect(computeRetryDelayMinutes(0)).toBe(1);
    expect(computeRetryDelayMinutes(1)).toBe(1);
    expect(computeRetryDelayMinutes(2)).toBe(3);
    expect(computeRetryDelayMinutes(3)).toBe(10);
    expect(computeRetryDelayMinutes(4)).toBe(30);
    expect(computeRetryDelayMinutes(5)).toBe(60);
    expect(computeRetryDelayMinutes(MAX_AUTO_RETRY_ATTEMPTS)).toBe(60);
  });

  it("marks only transient network/server errors as retryable", () => {
    expect(isRetryableSyncError(new NetworkError("offline"))).toBe(true);
    expect(isRetryableSyncError(new ApiError("unauthorized", 401, "unauthorized"))).toBe(true);
    expect(isRetryableSyncError(new ApiError("server", 503, "server"))).toBe(true);
    expect(isRetryableSyncError(new ApiError("validation", 422, "validation"))).toBe(false);
    expect(isRetryableSyncError(new Error("boom"))).toBe(false);
  });

  it("returns readable sync error messages", () => {
    expect(getSyncErrorMessage(new NetworkError("socket timeout"))).toBe("socket timeout");
    expect(getSyncErrorMessage(new ApiError("HTTP 500", 500, "HTTP 500"))).toBe("HTTP 500");
    expect(getSyncErrorMessage(new Error("unknown failure"))).toBe("unknown failure");
    expect(getSyncErrorMessage("bad")).toBe("Sync failed");
  });
});
