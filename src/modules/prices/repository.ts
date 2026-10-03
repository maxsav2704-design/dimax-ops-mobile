import { getState, setState } from "@/lib/db";
import { parseFactoryPrices, type FactoryPriceSnapshot } from "./contract";

export const FACTORY_PRICES_KEY = "factory_prices_v1";

// Call under the workspace database guard, just like other local repositories.
export async function readFactoryPrices(): Promise<FactoryPriceSnapshot | null> {
  const value = await getState(FACTORY_PRICES_KEY);
  return value === null ? null : parseFactoryPrices(JSON.parse(value));
}

export async function storeFactoryPrices(value: FactoryPriceSnapshot | null): Promise<void> {
  await setState(FACTORY_PRICES_KEY, value === null ? null : JSON.stringify(value));
}

export async function capturePriceVersion(): Promise<{ price_list_id?: string }> {
  const prices = await readFactoryPrices();
  return prices ? { price_list_id: prices.price_list_id } : {};
}
