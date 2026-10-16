import { describe, expect, it } from "vitest";
import { parseFactoryPrices } from "./contract";

const snapshot = {
  price_list_id: "00000000-0000-0000-0000-000000000001", version: 1, currency: "ILS",
  effective_from: "2026-10-03T08:00:00Z",
  items: [{ kind: "DOOR", target_id: "00000000-0000-0000-0000-000000000002", unit: "pcs", rate: "250.00" }],
};

describe("confirmed installer price contract", () => {
  it("keeps only installer-facing fields and exact decimal strings", () => {
    expect(parseFactoryPrices({ ...snapshot, approval_token: "secret", factory_email: "private",
      items: [{ ...snapshot.items[0], client_price: "900.00" }] })).toEqual(snapshot);
    expect(parseFactoryPrices(null)).toBeNull();
  });
  it.each([undefined, [], {}, 0, { ...snapshot, price_list_id: "bad" },
    { ...snapshot, version: 1.5 }, { ...snapshot, currency: "USD" },
    { ...snapshot, effective_from: "2026-10-03T08:00:00" },
    { ...snapshot, items: [...snapshot.items, ...snapshot.items] }])("rejects malformed snapshots: %j", (value) => {
    expect(() => parseFactoryPrices(value)).toThrow();
  });
  it.each(["0", "-1", "1.001", "1e3", "NaN", "Infinity", 250, "10000000000.00"])("rejects invalid rate %s", (rate) => {
    expect(() => parseFactoryPrices({ ...snapshot, items: [{ ...snapshot.items[0], rate }] })).toThrow();
  });
});
