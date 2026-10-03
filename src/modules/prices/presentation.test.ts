import { describe, expect, it } from "vitest";
import type { FactoryPriceSnapshot } from "./contract";
import type { PendingSyncEvent } from "@/modules/sync/types";
import { buildWorkPrice, estimateFactoryAmount } from "./presentation";

const snapshot: FactoryPriceSnapshot = {
  price_list_id: "list-v2", version: 2, currency: "ILS", effective_from: "2026-01-01T00:00:00Z",
  items: [
    { kind: "DOOR", target_id: "entrance", rate: "250.00", unit: "pcs" },
    { kind: "ADDON", target_id: "adjustment", rate: "9.00", unit: "pcs" },
  ],
};
const door = { prices: { status: "ready" as const, snapshot }, kind: "DOOR" as const,
  targetId: "entrance", locale: "en" as const, now: Date.parse("2026-02-01T00:00:00Z") };
const event: PendingSyncEvent = {
  client_event_id: "event-a", project_id: "project-a", type: "DOOR_SET_STATUS", status: "PENDING",
  payload: { door_id: "door-a", status: "INSTALLED", price_list_id: "list-v1" },
  error: null, attempts: 0, happened_at: "2026-01-01T10:00:00Z", created_at: "2026-01-01T10:00:00Z",
  next_retry_at: null, last_attempt_at: null,
};

describe("confirmed work rate presentation", () => {
  it("labels an active saved rate without claiming an earning", () => {
    expect(buildWorkPrice(door)).toMatchObject({ value: "250.00 ILS", estimate: null,
      meta: "Factory confirmed · Saved list #2", link: null });
  });
  it("estimates add-on quantity separately from accrual", () => {
    expect(buildWorkPrice({ ...door, kind: "ADDON", targetId: "adjustment", unit: "pcs", quantity: "1,50" }))
      .toMatchObject({ title: "Rate per unit · pcs", value: "9.00 ILS", estimate: { label: "Estimated, not accrued", value: "13.50 ILS" } });
  });
  it.each(["ru", "he"] as const)("formats price labels and decimals for %s", (locale) => {
    const result = buildWorkPrice({ ...door, locale });
    expect(result.title).toBe(locale === "ru" ? "Ставка монтажа" : "תעריף התקנה");
    expect(result.value).toBe(locale === "ru" ? "250,00 ILS" : "250.00 ILS");
  });
  it.each(["loading", "unavailable", "ready"] as const)("never invents zero rates for %s", (status) => {
    const result = buildWorkPrice({ ...door, prices: { status, snapshot: null } });
    expect(result.value).toBeNull(); expect(result.estimate).toBeNull(); expect(result.note).not.toBe("");
  });
  it("does not match prices by a different target or work kind", () => {
    expect(buildWorkPrice({ ...door, targetId: "missing" }).value).toBeNull();
    expect(buildWorkPrice({ ...door, kind: "ADDON" }).value).toBeNull();
  });
  it("does not calculate a rate for the wrong quantity unit", () => {
    const result = buildWorkPrice({ ...door, kind: "ADDON", targetId: "adjustment", unit: "m", quantity: "2" });
    expect(result.value).toBeNull(); expect(result.estimate).toBeNull(); expect(result.note).toContain("unit differs");
  });
  it("does not show a future price as already effective", () => {
    expect(buildWorkPrice({ ...door, now: Date.parse("2025-12-31T23:00:00Z") }).value).toBeNull();
  });
  it("does not use the latest rate for previously completed work", () => {
    expect(buildWorkPrice({ ...door, completed: true })).toMatchObject({ value: null, estimate: null, link: "earnings" });
  });
  it.each(["PENDING", "FAILED", "BLOCKED"] as const)("does not reprice a %s queued work", (status) => {
    const result = buildWorkPrice({ ...door, completed: true, pending: { ...event, status } });
    expect(result).toMatchObject({ value: null, estimate: null, link: "queue" });
    expect(result.meta).toBe("Execution price version saved");
    expect(result.note).toContain("not yet confirmed on this device");
  });
  it("identifies a price conflict and leaves the saved event unchanged", () => {
    const pending = { ...event, status: "BLOCKED" as const, error: "CONFLICT_FACTORY_PRICE" };
    const before = JSON.stringify(pending);
    expect(buildWorkPrice({ ...door, pending })).toMatchObject({ title: "Price needs review", value: null, link: "queue" });
    expect(JSON.stringify(pending)).toBe(before);
  });
  it("keeps versionless legacy work distinct from today's list", () => {
    const pending = { ...event, payload: { door_id: "door-a", status: "INSTALLED" } };
    expect(buildWorkPrice({ ...door, pending })).toMatchObject({ value: null, meta: "No price version in this record" });
  });
});

describe("preview decimal multiplication", () => {
  it.each([
    ["9", "1,50", 1350], ["0.01", "0.50", 1], ["1.23", "0.50", 62], ["0.01", "0.01", null],
    ["250", "1", 25000], ["9999999999.99", "1", 999999999999],
    ["9", "0", null], ["9", "-1", null], ["9", "abc", null], ["9", "1.234", null],
    ["9", "", null], ["0", "1", null], ["invalid", "1", null],
    ["9999999999.99", "2", null], ["9999999999.99", "9999999999.99", null],
  ])("estimates %s x %s as %s minor units", (rate, quantity, expected) => {
    expect(estimateFactoryAmount(String(rate), String(quantity))).toBe(expected);
  });
});
