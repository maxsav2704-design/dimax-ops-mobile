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

export type EarningsPeriodFocus = "TODAY" | "MONTH" | "DAY";

export type EarningsFocusContext = {
  focus: EarningsPeriodFocus;
  selectedDay: string | null;
  currency: string;
  total: string;
  rows: InstallerEarningsRow[];
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

function buildInstallTypeSummary(rows: InstallerEarningsRow[]) {
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

  return Array.from(installTypeMap.values()).sort((a, b) => b.amount - a.amount);
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

  return {
    todayTotal: formatAmount(todayRows.reduce((sum, row) => sum + parseAmount(row.amount), 0)),
    monthTotal: formatAmount(rows.reduce((sum, row) => sum + parseAmount(row.amount), 0)),
    currency: snapshot.currency,
    rows,
    todayRows,
    installTypeSummary: buildInstallTypeSummary(rows),
  };
}

export function buildEarningsFocusContext(
  snapshot: InstallerEarningsSummary | null,
  todayDate: string,
  focus: EarningsPeriodFocus,
  selectedDay?: string | null
): EarningsFocusContext | null {
  if (!snapshot) {
    return null;
  }

  const effectiveDay = focus === "DAY" ? selectedDay || todayDate : null;
  const rows =
    focus === "TODAY"
      ? snapshot.rows.filter((row) => row.work_date === todayDate)
      : focus === "DAY"
        ? snapshot.rows.filter((row) => row.work_date === effectiveDay)
        : snapshot.rows;

  return {
    focus,
    selectedDay: effectiveDay,
    currency: snapshot.currency,
    total: formatAmount(rows.reduce((sum, row) => sum + parseAmount(row.amount), 0)),
    rows,
    installTypeSummary: buildInstallTypeSummary(rows),
  };
}
