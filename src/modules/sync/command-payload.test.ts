import { describe, expect, it } from "vitest";
import { commandPayload } from "./command-payload";

describe("outbox transport contract", () => {
  it("removes only local undo fields without mutating the saved work", () => {
    const payload = Object.freeze({ door_id: "door", status: "INSTALLED", previous_version: 4,
      price_list_id: "version", previous_status: "IN_PROGRESS", previous_is_locked: 0,
      previous_reason_id: null, previous_comment: "local" });
    expect(commandPayload({ type: "DOOR_SET_STATUS", payload })).toEqual({
      door_id: "door", status: "INSTALLED", previous_version: 4, price_list_id: "version",
    });
    expect(payload.previous_comment).toBe("local");
  });
  it("never hides untrusted monetary fields from server validation", () => {
    expect(commandPayload({ type: "DOOR_SET_STATUS", payload: { rate: "999", factory_approved: true } }))
      .toEqual({ rate: "999", factory_approved: true });
  });
  it("leaves other event contracts unchanged", () => {
    const payload = { qty_done: "1.50", addon_type_id: "addon", price_list_id: "version" };
    expect(commandPayload({ type: "ADDON_FACT_CREATE", payload })).toEqual(payload);
    expect(commandPayload({ type: "ISSUE_CREATE", payload: { title: "Issue" } })).toEqual({ title: "Issue" });
  });
});
