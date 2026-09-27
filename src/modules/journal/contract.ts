import type { InstallerJournalDetails, InstallerJournalSummary } from "./types";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const nullableString = (value: unknown) => value === null || typeof value === "string";
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const optionalTime = (value: unknown) => value === null || timestamp(value);

export function isJournalSummary(value: unknown): value is InstallerJournalSummary {
  return record(value) && typeof value.id === "string" && Boolean(value.id) &&
    typeof value.project_id === "string" && Boolean(value.project_id) &&
    typeof value.project_name === "string" && nullableString(value.project_address) &&
    nullableString(value.developer_company) && nullableString(value.developer_email) &&
    ["DRAFT", "ACTIVE", "ARCHIVED"].includes(String(value.status)) &&
    count(value.completed_doors) && count(value.completed_addons) && optionalTime(value.signed_at) &&
    nullableString(value.signer_name) && nullableString(value.email_last_error) &&
    ["NONE", "PENDING", "DELIVERED", "FAILED"].includes(String(value.email_delivery_status)) &&
    typeof value.can_submit === "boolean";
}

export function isJournalDetails(input: unknown): input is InstallerJournalDetails {
  if (!record(input)) return false;
  const value = input;
  if (!isJournalSummary(input)) return false;
  return nullableString(value.title) && count(value.snapshot_version) &&
    (value.pdf_locale === undefined || ["en", "ru", "he"].includes(String(value.pdf_locale))) &&
    optionalTime(value.public_token_expires_at) && nullableString(value.signing_url) &&
    Array.isArray(value.doors) && value.doors.every((item: unknown) => record(item) &&
      typeof item.unit_label === "string" && typeof item.door_type_name === "string" && optionalTime(item.installed_at)) &&
    Array.isArray(value.addon_items) && value.addon_items.every((item: unknown) => record(item) &&
      typeof item.name === "string" && typeof item.unit === "string" &&
      typeof item.quantity === "string" && /^\d+(\.\d+)?$/.test(item.quantity) && Number.isFinite(Number(item.quantity)) &&
      timestamp(item.done_at) && nullableString(item.comment));
}

export function isJournalList(value: unknown): value is { items: InstallerJournalSummary[] } {
  return record(value) && Array.isArray(value.items) && value.items.every(isJournalSummary) &&
    new Set(value.items.map((item) => item.id)).size === value.items.length;
}
