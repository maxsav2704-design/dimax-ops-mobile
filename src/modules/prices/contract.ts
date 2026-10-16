export type FactoryPriceSnapshot = {
  price_list_id: string;
  version: number;
  currency: "ILS";
  effective_from: string;
  items: Array<{ kind: "DOOR" | "ADDON"; target_id: string; unit: string; rate: string }>;
};

export type FactoryPriceReadState =
  | { status: "loading" | "unavailable"; snapshot: null }
  | { status: "ready"; snapshot: FactoryPriceSnapshot | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid confirmed price snapshot");
  }
  return value as Record<string, unknown>;
}

export function parseFactoryPrices(value: unknown): FactoryPriceSnapshot | null {
  if (value === null) return null;
  const data = record(value);
  if (typeof data.price_list_id !== "string" || !UUID.test(data.price_list_id)
      || !Number.isSafeInteger(data.version) || Number(data.version) < 1
      || data.currency !== "ILS" || typeof data.effective_from !== "string"
      || !/(Z|[+-]\d{2}:\d{2})$/.test(data.effective_from)
      || !Number.isFinite(Date.parse(data.effective_from)) || !Array.isArray(data.items)) {
    throw new Error("Invalid confirmed price snapshot");
  }
  const keys = new Set<string>();
  const items: FactoryPriceSnapshot["items"] = data.items.map((value) => {
    const item = record(value);
    if ((item.kind !== "DOOR" && item.kind !== "ADDON")
        || typeof item.target_id !== "string" || !UUID.test(item.target_id)
        || typeof item.unit !== "string" || !item.unit.trim()
        || typeof item.rate !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(item.rate)
        || Number(item.rate) <= 0) {
      throw new Error("Invalid confirmed price item");
    }
    const key = `${item.kind}:${item.target_id.toLowerCase()}`;
    if (keys.has(key)) throw new Error("Duplicate confirmed price item");
    keys.add(key);
    return { kind: item.kind, target_id: item.target_id, unit: item.unit, rate: item.rate };
  });
  // Persist only installer-facing fields, never a raw server object.
  return { price_list_id: data.price_list_id, version: Number(data.version), currency: "ILS",
    effective_from: data.effective_from, items };
}
