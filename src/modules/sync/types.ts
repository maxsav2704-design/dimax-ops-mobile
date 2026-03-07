export type SyncEventType = "DOOR_SET_STATUS" | "ADDON_FACT_CREATE";
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
    waze_url: string | null;
  }>;
  doors: Array<Record<string, any>>;
  door_types: Array<{ id: string; code: string; name: string }>;
  reasons: Array<{ id: string; code: string; name: string }>;
  addon_types: Array<{ id: string; name: string; unit: string }>;
  addon_plans: Array<{
    project_id: string;
    addon_type_id: string;
    qty_planned: string;
    client_price: string;
    installer_price: string;
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
