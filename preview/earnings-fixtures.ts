import type { InstallerEarningsRow, InstallerEarningsViewModel } from "../src/modules/earnings/types";
import { currentLocalDateKey } from "../src/lib/date-key";
import { sumEarningsValues } from "../src/modules/earnings/decimal";

let source: InstallerEarningsViewModel["source"] = "online";
export function setEarningsPreviewSource(value: InstallerEarningsViewModel["source"]) { source = value; }
export async function loadInstallerEarnings(_period: string, anchorDay?: string | null): Promise<InstallerEarningsViewModel> {
  if (!window.location.pathname.endsWith("/earnings.html")) return { snapshot: null, source: "unavailable", message: null };
  const requestedSource = source;
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (requestedSource === "unavailable") return { snapshot: null, source: requestedSource, message: "TEST: no cached earnings" };
  const day = anchorDay || currentLocalDateKey();
  const rows: InstallerEarningsRow[] = Array.from({ length: 35 }, (_, index) => ({
    id: `preview-work-${index}`, work_date: index < 3 ? day : `${day.slice(0, 7)}-01`,
    project_id: "preview-project", project_name: "DIMAX / Tower A", door_label: `A-2-${201 + index}`,
    install_type_code: index === 2 ? "addon:adjustment" : "ENTRANCE", install_type_label: index === 2 ? "Frame adjustment" : "Entrance door",
    quantity: index === 2 ? 1.25 : 1, rate: index === 1 ? "-250.00" : index === 2 ? "80.00" : "250.00",
    amount: index === 1 ? "-250.00" : index === 2 ? "100.00" : "250.00",
  }));
  return { source: requestedSource, message: requestedSource === "cache" ? "TEST: offline" : null,
    snapshot: { period_key: day.slice(0, 7), currency: "ILS", today_total: "100.00", month_total: sumEarningsValues(rows.map((row) => row.amount)).toFixed(2), generated_at: new Date().toISOString(), days: [], install_types: [], rows } };
}
