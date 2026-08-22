export function normalizeAddonQuantity(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(",", ".") || "";
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  const integerPart = match[1].replace(/^0+(?=\d)/, "");
  const decimalPart = match[2] || "";
  if (integerPart.length > 10 || decimalPart.length > 2) {
    return null;
  }

  const canonical = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
  return Number.parseFloat(canonical) > 0 ? canonical : null;
}
