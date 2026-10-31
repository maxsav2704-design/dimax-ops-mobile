import { describe, expect, it } from "vitest";
import { ApiError, NetworkError, RequestTimeoutError } from "@/lib/errors";
import {
  MAX_AUTO_RETRY_ATTEMPTS,
  computeRetryDelayMinutes,
  getSyncErrorMessage,
  isAccountRefusal,
  isOfflineSyncError,
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
    expect(isRetryableSyncError(new ApiError("slow down", 429, "slow down"))).toBe(true);
    expect(isRetryableSyncError(new ApiError("validation", 422, "validation"))).toBe(false);
    expect(isRetryableSyncError(new Error("boom"))).toBe(false);
  });

  it("tells a missing connection from a server that did not answer in time", () => {
    expect(isOfflineSyncError(new NetworkError("Network request failed"))).toBe(true);
    // A timed-out request may have reached the server, so it still uses a retry.
    expect(isOfflineSyncError(new RequestTimeoutError())).toBe(false);
    expect(isRetryableSyncError(new RequestTimeoutError())).toBe(true);
    expect(isOfflineSyncError(new ApiError("server", 503, "server"))).toBe(false);
  });

  it("treats a 403 on the whole request as a refusal of the account, not of the work", () => {
    expect(isAccountRefusal(new ApiError("User is inactive or unavailable", 403, ""))).toBe(true);
    expect(isAccountRefusal(new ApiError("validation", 422, ""))).toBe(false);
    expect(isAccountRefusal(new NetworkError("offline"))).toBe(false);
  });

  it("returns readable sync error messages", () => {
    expect(getSyncErrorMessage(new NetworkError("socket timeout"))).toBe("socket timeout");
    expect(getSyncErrorMessage(new ApiError("HTTP 500", 500, "HTTP 500"))).toBe("HTTP 500");
    expect(getSyncErrorMessage(new Error("unknown failure"))).toBe("unknown failure");
    expect(getSyncErrorMessage("bad")).toBe("Sync failed");
  });
});
