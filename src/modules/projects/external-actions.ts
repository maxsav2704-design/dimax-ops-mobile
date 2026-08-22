import * as Linking from "expo-linking";
import type { ProjectDetailsResponse, ProjectListItem } from "@/modules/projects/types";

export type ProjectExternalActionKind = "waze" | "whatsapp" | "call";

export type ProjectExternalAction = {
  kind: ProjectExternalActionKind;
  url: string;
};

type ProjectExternalLinkSource =
  | Pick<ProjectListItem, "waze_url" | "whatsapp_url" | "call_url">
  | Pick<
      ProjectDetailsResponse,
      | "waze_url"
      | "whatsapp_url"
      | "call_url"
      | "address_details"
      | "developer"
      | "contact_phone"
      | "developer_whatsapp"
    >;

type ProjectExternalLinks = {
  waze_url: string | null;
  whatsapp_url: string | null;
  call_url: string | null;
};

function sanitizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }
  const digits = phone.replace(/\D+/g, "");
  return digits ? digits : null;
}

function buildWhatsAppUrl(phone: string | null | undefined): string | null {
  const digits = sanitizePhoneDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

function buildCallUrl(phone: string | null | undefined): string | null {
  const normalized = phone?.trim();
  return normalized ? `tel:${normalized}` : null;
}

export function normalizeWazeUrl(url: string | null | undefined): string | null {
  const normalized = url?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("waze://")) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (!/waze\.com$/i.test(parsed.hostname) && !/\.waze\.com$/i.test(parsed.hostname)) {
      return null;
    }

    const query = parsed.searchParams.toString();
    return query ? `waze://?${query}` : "waze://";
  } catch {
    return null;
  }
}

export function normalizeWhatsAppUrl(url: string | null | undefined): string | null {
  const normalized = url?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("whatsapp://send")) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase();
    let phone: string | null = null;

    if (hostname === "wa.me" || hostname.endsWith(".wa.me")) {
      phone = sanitizePhoneDigits(parsed.pathname.replace(/^\/+/, "").split("/")[0]);
    } else if (hostname === "api.whatsapp.com" || hostname.endsWith(".api.whatsapp.com")) {
      phone = sanitizePhoneDigits(parsed.searchParams.get("phone"));
    } else {
      return null;
    }

    if (!phone) {
      return null;
    }

    const params = new URLSearchParams({ phone });
    const text = parsed.searchParams.get("text");
    if (text) {
      params.set("text", text);
    }
    return `whatsapp://send?${params.toString()}`;
  } catch {
    return null;
  }
}

export function normalizeCallUrl(url: string | null | undefined): string | null {
  const normalized = url?.trim();
  if (!normalized || !normalized.toLowerCase().startsWith("tel:")) {
    return null;
  }
  const phone = normalized.slice(4).replace(/[^\d+*#,;]/g, "");
  return /\d/.test(phone) ? `tel:${phone}` : null;
}

export function deriveProjectExternalLinks(source: ProjectExternalLinkSource | null | undefined): ProjectExternalLinks {
  if (!source) {
    return {
      waze_url: null,
      whatsapp_url: null,
      call_url: null,
    };
  }

  const developer = "developer" in source ? source.developer : null;
  const addressDetails = "address_details" in source ? source.address_details : null;
  const developerWhatsapp = "developer_whatsapp" in source ? source.developer_whatsapp : null;
  const contactPhone = "contact_phone" in source ? source.contact_phone : null;

  return {
    waze_url: source.waze_url ?? addressDetails?.waze_deep_link ?? addressDetails?.waze_url ?? null,
    whatsapp_url:
      source.whatsapp_url ??
      developer?.whatsapp_deep_link ??
      buildWhatsAppUrl(developerWhatsapp ?? developer?.whatsapp ?? null),
    call_url:
      source.call_url ??
      developer?.call_deep_link ??
      buildCallUrl(contactPhone ?? developer?.phone ?? null),
  };
}

export function buildProjectExternalActions(source: ProjectExternalLinkSource | null | undefined): ProjectExternalAction[] {
  const links = deriveProjectExternalLinks(source);
  const actions: ProjectExternalAction[] = [];

  if (links.waze_url && normalizeWazeUrl(links.waze_url)) {
    actions.push({ kind: "waze", url: links.waze_url });
  }
  if (links.whatsapp_url && normalizeWhatsAppUrl(links.whatsapp_url)) {
    actions.push({ kind: "whatsapp", url: links.whatsapp_url });
  }
  if (links.call_url && normalizeCallUrl(links.call_url)) {
    actions.push({ kind: "call", url: links.call_url });
  }

  return actions;
}

export async function openProjectExternalAction(action: ProjectExternalAction): Promise<void> {
  const candidateUrl =
    action.kind === "waze"
      ? normalizeWazeUrl(action.url)
      : action.kind === "whatsapp"
        ? normalizeWhatsAppUrl(action.url)
        : normalizeCallUrl(action.url);
  if (!candidateUrl) {
    throw new Error(`Unsupported ${action.kind} URL`);
  }

  try {
    await Linking.openURL(candidateUrl);
  } catch (error) {
    if ((action.kind === "waze" || action.kind === "whatsapp") && candidateUrl !== action.url) {
      await Linking.openURL(action.url);
      return;
    }
    throw error;
  }
}
