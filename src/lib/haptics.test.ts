import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  os: "android",
  notificationAsync: vi.fn(),
  impactAsync: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { get OS() { return native.os; } } }));
vi.mock("expo-haptics", () => ({
  notificationAsync: native.notificationAsync,
  impactAsync: native.impactAsync,
  NotificationFeedbackType: { Success: "success-type", Warning: "warning-type", Error: "error-type" },
  ImpactFeedbackStyle: { Light: "light-style" },
}));

import { triggerHaptic } from "./haptics";

describe("triggerHaptic", () => {
  beforeEach(() => {
    native.os = "android";
    native.notificationAsync.mockReset().mockResolvedValue(undefined);
    native.impactAsync.mockReset().mockResolvedValue(undefined);
  });

  it("maps outcome signals to notification feedback and taps to a light impact", async () => {
    await expect(triggerHaptic("success")).resolves.toBe(true);
    await expect(triggerHaptic("warning")).resolves.toBe(true);
    await expect(triggerHaptic("error")).resolves.toBe(true);
    expect(native.notificationAsync.mock.calls).toEqual([["success-type"], ["warning-type"], ["error-type"]]);
    await expect(triggerHaptic("tap")).resolves.toBe(true);
    expect(native.impactAsync).toHaveBeenCalledExactlyOnceWith("light-style");
  });

  it("stays silent on web without touching the native module", async () => {
    native.os = "web";
    await expect(triggerHaptic("success")).resolves.toBe(false);
    expect(native.notificationAsync).not.toHaveBeenCalled();
  });

  it("never throws when the device rejects the request", async () => {
    native.notificationAsync.mockRejectedValue(new Error("no vibrator"));
    await expect(triggerHaptic("error")).resolves.toBe(false);
  });
});
