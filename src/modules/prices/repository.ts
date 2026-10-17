import { getState, setState } from "@/lib/db";
import { parseFactoryPrices, type FactoryPriceSnapshot } from "./contract";

export const FACTORY_PRICES_KEY = "factory_prices_v1";

// Call under the workspace database guard, just like other local repositories.
export async function readFactoryPrices(): Promise<FactoryPriceSnapshot | null> {
  const value = await getState(FACTORY_PRICES_KEY);
  if (value === null) return null;
  try {
    return parseFactoryPrices(JSON.parse(value));
  } catch {
    // A damaged cache is treated as "no confirmed list on this device": the work is
    // queued without a price claim and the server prices it by execution time. The
    // next sync replaces the cache.
    return null;
  }
}

export async function storeFactoryPrices(value: FactoryPriceSnapshot | null): Promise<void> {
  await setState(FACTORY_PRICES_KEY, value === null ? null : JSON.stringify(value));
}

export async function capturePriceVersion(now: Date = new Date()): Promise<{ price_list_id?: string }> {
  // The stamp says "this is the list the installer saw in effect". A list that only
  // becomes effective later must not be claimed: the server would refuse the work
  // with CONFLICT_FACTORY_PRICE and the door would stay blocked.
  const prices = await readFactoryPrices();
  if (!prices || Date.parse(prices.effective_from) > now.getTime()) return {};
  return { price_list_id: prices.price_list_id };
}
