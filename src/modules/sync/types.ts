export type SyncEventType = "DOOR_SET_STATUS" | "ADDON_FACT_CREATE" | "ISSUE_CREATE";
export type PendingSyncStatus = "PENDING" | "FAILED" | "BLOCKED";

export type PendingSyncEvent = {
  client_event_id: string;
  type: SyncEventType;
  project_id: string;
  happened_at: string | null;
  payload: Record<string, unknown>;
  status: PendingSyncStatus;
  error: string | null;
  attempts: number;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  created_at: string;
};

export type SyncQueueSummary = {
  total: number;
  pending: number;
  failed: number;
  blocked: number;
  ready_to_send: number;
  next_retry_at: string | null;
};

export type SyncChange = {
  cursor_id: number;
  change_type: string;
  payload: Record<string, any>;
};

export type SyncSnapshot = {
  projects: Array<{
    id: string;
    name: string;
    address: string | null;
    status: string;
    lifecycle_status: string;
    health_status: string;
    waze_url: string | null;
    updated_at?: string | null;
  }>;
  doors: Array<{
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
    version?: number | null;
    updated_at?: string | null;
  }>;
  door_types: Array<{ id: string; code: string; name: string }>;
  reasons: Array<{ id: string; code: string; name: string }>;
  addon_types: Array<{ id: string; name: string; unit: string }>;
  addon_plans: Array<{
    project_id: string;
    addon_type_id: string;
    qty_planned: string;
  }>;
  addon_facts: Array<{
    id: string;
    project_id: string;
    addon_type_id: string;
    installer_id: string | null;
    qty_done: string;
    done_at: string;
    comment: string | null;
    source: string;
    updated_at?: string | null;
  }>;
  issues?: Array<{
    id: string;
    door_id: string;
    project_id: string;
    status: string;
    title: string | null;
    details: string | null;
  }>;
};

export type SyncResponse = {
  server_time: string;
  next_cursor: number;
  reset_required: boolean;
  snapshot: SyncSnapshot | null;
  acks: Array<{
    client_event_id: string;
    ok: boolean;
    applied: boolean;
    error: string | null;
  }>;
  changes: SyncChange[];
};
