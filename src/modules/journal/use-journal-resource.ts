import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { JournalLoadResult } from "./types";

// Journal reads refresh after returning from the external signing page as well as navigation.
export function useJournalResource<T>(key: string, syncVersion: number, load: () => Promise<JournalLoadResult<T>>) {
  const [stored, setStored] = useState<{ key: string; result: JournalLoadResult<T> | null; failed: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  const active = useRef(false);
  const foreground = useRef(AppState.currentState == null || AppState.currentState === "active");
  const currentKey = useRef(key);
  currentKey.current = key;
  const locked = useMemo(() => ({ current: false, refreshPending: false }), [key]);

  const reload = useCallback(async () => {
    if (!active.current || currentKey.current !== key || !foreground.current) return;
    if (locked.current) {
      // Returning from the signing browser can race the link-opening promise.
      locked.refreshPending = true;
      return;
    }
    locked.refreshPending = false;
    const request = ++revision.current;
    setPending(true);
    try {
      const result = await load();
      if (request === revision.current && currentKey.current === key) setStored({ key, result, failed: false });
    } catch {
      if (request === revision.current && currentKey.current === key) setStored({ key, result: null, failed: true });
    } finally {
      if (request === revision.current) setPending(false);
    }
  }, [key, load, locked]);

  useFocusEffect(useCallback(() => {
    active.current = true;
    foreground.current = AppState.currentState == null || AppState.currentState === "active";
    void reload();
    const subscription = AppState.addEventListener("change", (state) => {
      foreground.current = state === "active";
      if (foreground.current) void reload();
      else {
        revision.current += 1;
        setPending(false);
      }
    });
    return () => { active.current = false; revision.current += 1; subscription.remove(); };
  }, [reload, syncVersion]));

  const replace = (result: JournalLoadResult<T>) => {
    revision.current += 1;
    setPending(false);
    setStored({ key, result, failed: false });
  };
  const invalidateRead = () => { revision.current += 1; setPending(false); };
  const release = () => {
    const refreshPending = locked.refreshPending;
    locked.current = false;
    locked.refreshPending = false;
    if (refreshPending) void reload();
  };
  const valid = stored?.key === key;
  return {
    result: valid ? stored.result : null,
    failed: valid && stored.failed,
    loading: pending || !valid,
    reload, replace, invalidateRead, locked, release,
    isCurrent: () => active.current && currentKey.current === key,
  };
}
