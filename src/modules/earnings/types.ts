export type InstallerEarningsInstallType = {
  code: string;
  label: string;
  amount: string;
  quantity: number;
};

export type InstallerEarningsDay = {
  date: string;
  amount: string;
  jobs_count: number;
};

export type InstallerEarningsRow = {
  id: string;
  work_date: string;
  project_id: string | null;
  project_name: string | null;
  door_label: string | null;
  install_type_code: string;
  install_type_label: string;
  quantity: number;
  rate: string;
  amount: string;
};

export type InstallerEarningsSummary = {
  period_key: string;
  currency: string;
  today_total: string;
  month_total: string;
  days: InstallerEarningsDay[];
  install_types: InstallerEarningsInstallType[];
  rows: InstallerEarningsRow[];
  generated_at: string | null;
};

export type InstallerEarningsViewModel = {
  snapshot: InstallerEarningsSummary | null;
  source: "online" | "cache" | "unavailable";
  message: string | null;
};
