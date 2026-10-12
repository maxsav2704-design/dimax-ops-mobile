import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { getSyncStatusSnapshot } from "@/modules/sync/service";
import { getSyncStatusState, notifySyncQueueChanged, setSyncSnapshot, subscribeSyncStatus, type SyncStatusState } from "@/modules/sync/status";
import { useAuth } from "@/providers/AppProviders";

/** Shared sync state for any screen: reloads the queue snapshot whenever it may have changed. */
export function useSyncStatus(): SyncStatusState {
  const state = useSyncExternalStore(subscribeSyncStatus, getSyncStatusState);
  const { user, syncVersion } = useAuth();
  const identity = user ? `${user.company_id}:${user.id}` : null;

  useEffect(() => {
    if (!identity) return;
    let active = true;
    getSyncStatusSnapshot().then(
      (snapshot) => { if (active) setSyncSnapshot(snapshot); },
      () => undefined, // A workspace switch or storage hiccup keeps the last known state.
    );
    return () => { active = false; };
  }, [identity, state.queueVersion, syncVersion]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") notifySyncQueueChanged();
    });
    return () => subscription.remove();
  }, []);

  return state;
}
