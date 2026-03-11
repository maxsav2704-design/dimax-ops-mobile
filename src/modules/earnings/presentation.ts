import type { InstallerEarningsRow, InstallerEarningsSummary } from "@/modules/earnings/types";

export type ProjectEarningsContext = {
  todayTotal: string;
  monthTotal: string;
  currency: string;
  rows: InstallerEarningsRow[];
  todayRows: InstallerEarningsRow[];
  installTypeSummary: Array<{
    code: string;
    label: string;
    amount: number;
    quantity: number;
  }>;
};

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  return value.toFixed(2);
}

export function buildProjectEarningsContext(
  snapshot: InstallerEarningsSummary | null,
  projectId: string,
  todayDate: string
): ProjectEarningsContext | null {
  if (!snapshot) {
    return null;
  }

  const rows = snapshot.rows.filter((row) => row.project_id === projectId);
  if (!rows.length) {
    return {
      todayTotal: "0.00",
      monthTotal: "0.00",
      currency: snapshot.currency,
      rows: [],
      todayRows: [],
      installTypeSummary: [],
    };
  }

  const todayRows = rows.filter((row) => row.work_date === todayDate);
  const installTypeMap = new Map<
    string,
    {
      code: string;
      label: string;
      amount: number;
      quantity: number;
    }
  >();

  for (const row of rows) {
    const key = row.install_type_code;
    const current = installTypeMap.get(key) || {
      code: row.install_type_code,
      label: row.install_type_label,
      amount: 0,
      quantity: 0,
    };
    current.amount += parseAmount(row.amount);
    current.quantity += row.quantity;
    installTypeMap.set(key, current);
  }

  return {
    todayTotal: formatAmount(todayRows.reduce((sum, row) => sum + parseAmount(row.amount), 0)),
    monthTotal: formatAmount(rows.reduce((sum, row) => sum + parseAmount(row.amount), 0)),
    currency: snapshot.currency,
    rows,
    todayRows,
    installTypeSummary: Array.from(installTypeMap.values()).sort((a, b) => b.amount - a.amount),
  };
}
