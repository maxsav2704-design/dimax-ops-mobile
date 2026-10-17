import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getState: vi.fn(), setState: vi.fn() }));
vi.mock("@/lib/db", () => ({ getState: mocks.getState, setState: mocks.setState }));

import { capturePriceVersion, readFactoryPrices } from "./repository";

const snapshot = {
  price_list_id: "00000000-0000-0000-0000-000000000001", version: 1, currency: "ILS",
  effective_from: "2026-10-01T08:00:00Z", items: [],
};

beforeEach(() => vi.clearAllMocks());

describe("factory price cache", () => {
  it("returns the cached confirmed list", async () => {
    mocks.getState.mockResolvedValue(JSON.stringify(snapshot));
    expect(await readFactoryPrices()).toEqual(snapshot);
    expect(await capturePriceVersion()).toEqual({ price_list_id: snapshot.price_list_id });
  });

  it.each(["not json", JSON.stringify({ price_list_id: "x" })])(
    "treats a damaged cache (%s) as no confirmed list instead of failing the work", async (value) => {
      // Regression (audit A5): queueDoorStatusEvent threw here, so the install could not be saved.
      mocks.getState.mockResolvedValue(value);
      expect(await readFactoryPrices()).toBeNull();
      expect(await capturePriceVersion()).toEqual({});
    },
  );
});
