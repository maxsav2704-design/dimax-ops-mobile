export type ProjectLifecycleStatus =
  | "PLANNED"
  | "ACTIVE"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export type ProjectHealthStatus = "NORMAL" | "AT_RISK" | "BLOCKED";

export type ProjectListItem = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  lifecycle_status: ProjectLifecycleStatus;
  health_status: ProjectHealthStatus;
  waze_url: string | null;
  whatsapp_url?: string | null;
  call_url?: string | null;
};

export type InstallerDoor = {
  id: string;
  project_id: string;
  door_type_id: string;
  unit_label: string;
  order_number: string | null;
  house_number: string | null;
  floor_label: string | null;
  apartment_number: string | null;
  location_code: string | null;
  door_marking: string | null;
  status: string;
  reason_id: string | null;
  comment: string | null;
  is_locked: boolean;
  version: number;
  updated_at: string | null;
};

export type DoorTypeOption = {
  id: string;
  code: string;
  name: string;
};

export type ProjectIssue = {
  id: string;
  door_id: string;
  project_id: string;
  status: string;
  title: string | null;
  details: string | null;
};

export type ProjectAddonTypeOption = {
  id: string;
  name: string;
  unit: string;
  qty_planned: string | null;
};

export type ProjectAddonFact = {
  id: string;
  project_id: string;
  addon_type_id: string;
  addon_name: string;
  unit: string;
  qty_done: string;
  done_at: string;
  comment: string | null;
  source: string;
  updated_at: string | null;
};

export type ProjectDetailsResponse = {
  id: string;
  name: string;
  address: string | null;
  address_details?: {
    waze_url?: string | null;
    waze_deep_link?: string | null;
  } | null;
  waze_url: string | null;
  whatsapp_url?: string | null;
  call_url?: string | null;
  developer?: {
    phone?: string | null;
    whatsapp?: string | null;
    whatsapp_deep_link?: string | null;
    call_deep_link?: string | null;
  } | null;
  contact_phone?: string | null;
  developer_whatsapp?: string | null;
  status: string;
  lifecycle_status: ProjectLifecycleStatus;
  health_status: ProjectHealthStatus;
  server_time: string;
  doors: Array<{
    id: string;
    unit_label: string;
    door_type_id: string;
    order_number: string | null;
    house_number: string | null;
    floor_label: string | null;
    apartment_number: string | null;
    location_code: string | null;
    door_marking: string | null;
    status: string;
    reason_id: string | null;
    comment: string | null;
    is_locked: boolean;
    version?: number | null;
  }>;
  issues_open: Array<{
    id: string;
    door_id: string;
    status: string;
    title: string | null;
    details: string | null;
  }>;
  door_types_catalog: Array<{ id: string; code: string; name: string }>;
  reasons_catalog: Array<{ id: string; code: string; name: string }>;
  addons: {
    types: Array<{ id: string; name: string; unit: string }>;
    plan: Array<{
      addon_type_id: string;
      qty_planned: string;
    }>;
    facts: Array<{
      id: string;
      addon_type_id: string;
      qty_done: string;
      done_at: string;
      comment: string | null;
      source: string;
    }>;
  };
};
