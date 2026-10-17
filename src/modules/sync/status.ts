import { NetworkError } from "@/lib/errors";
import type { SyncQueueSummary } from "@/modules/sync/types";

export type SyncStatusState = {
  queue: SyncQueueSummary | null;
  lastSyncAt: string | null;
  syncing: boolean;
  offline: boolean;
  /** The last run failed for a reason other than being offline (server fault, bad response). */
  failed: boolean;
  /** Bumps whenever the queue may have changed; readers reload the snapshot on change. */
  queueVersion: number;
};

const initialState: SyncStatusState = { queue: null, lastSyncAt: null, syncing: false, offline: false, failed: false, queueVersion: 0 };
let state: SyncStatusState = initialState;
let activeSyncs = 0;
const listeners = new Set<() => void>();

function publish(next: SyncStatusState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getSyncStatusState(): SyncStatusState {
  return state;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function markSyncStarted(): void {
  activeSyncs += 1;
  if (!state.syncing) publish({ ...state, syncing: true });
}

export function markSyncFinished(error: unknown): void {
  activeSyncs = Math.max(0, activeSyncs - 1);
  publish({
    ...state,
    syncing: activeSyncs > 0,
    offline: error instanceof NetworkError,
    failed: error != null && !(error instanceof NetworkError),
    queueVersion: state.queueVersion + 1,
  });
}

export function notifySyncQueueChanged(): void {
  publish({ ...state, queueVersion: state.queueVersion + 1 });
}

export function setSyncSnapshot(snapshot: { queue: SyncQueueSummary; lastSyncAt: string | null }): void {
  publish({ ...state, queue: snapshot.queue, lastSyncAt: snapshot.lastSyncAt });
}

export function resetSyncStatus(): void {
  activeSyncs = 0;
  publish(initialState);
}
