export type ProjectListItem = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  waze_url: string | null;
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
  updated_at: string | null;
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
  client_price: string | null;
  installer_price: string | null;
};

export type ProjectDetailsResponse = {
  id: string;
  name: string;
  address: string | null;
  waze_url: string | null;
  status: string;
  server_time: string;
  doors: Array<{
    id: string;
    unit_label: string;
    door_type_id: string;
    our_price: string;
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
      client_price: string;
      installer_price: string;
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
