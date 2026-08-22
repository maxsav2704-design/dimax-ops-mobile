export type JournalStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type JournalDeliveryStatus = "NONE" | "PENDING" | "DELIVERED" | "FAILED";

export type InstallerJournalSummary = {
  id: string;
  project_id: string;
  project_name: string;
  project_address: string | null;
  developer_company: string | null;
  developer_email: string | null;
  status: JournalStatus;
  completed_doors: number;
  completed_addons: number;
  signed_at: string | null;
  signer_name: string | null;
  email_delivery_status: JournalDeliveryStatus;
  email_last_error: string | null;
  can_submit: boolean;
};

export type InstallerJournalDetails = InstallerJournalSummary & {
  title: string | null;
  snapshot_version: number;
  public_token_expires_at: string | null;
  signing_url: string | null;
  doors: Array<{
    unit_label: string;
    door_type_name: string;
    installed_at: string | null;
  }>;
  addon_items: Array<{
    name: string;
    quantity: string;
    unit: string;
    done_at: string;
    comment: string | null;
  }>;
};

export type JournalLoadResult<T> = {
  data: T;
  source: "online" | "cache";
  message: string | null;
};

export type JournalMarkReadyResponse = {
  signing_url: string;
  public_token_expires_at: string;
};

export type JournalPdfLinkResponse = {
  url: string;
  ttl_sec: number;
  uses: number;
};
