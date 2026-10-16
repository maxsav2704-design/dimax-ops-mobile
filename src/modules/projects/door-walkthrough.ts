type WalkthroughDoor = { id: string; status: string; is_locked: boolean };

/** Doors still open for field work: not installed, not locked by the office. */
export function isDoorOpenForWork(door: WalkthroughDoor): boolean {
  return !door.is_locked && door.status !== "INSTALLED" && door.status !== "LOCKED";
}

/**
 * The next door to walk to, in the displayed order, after the selected one.
 * Wraps to the start so a walkthrough never dead-ends; never returns the selected door.
 */
export function findNextDoor<T extends WalkthroughDoor>(doors: ReadonlyArray<T>, selectedId: string): T | null {
  if (!doors.length) return null;
  const start = doors.findIndex((door) => door.id === selectedId);
  for (let step = 1; step <= doors.length; step += 1) {
    const candidate = doors[(start + step) % doors.length];
    if (candidate.id !== selectedId && isDoorOpenForWork(candidate)) return candidate;
  }
  return null;
}

export function countDoorsOpenForWork(doors: ReadonlyArray<WalkthroughDoor>): number {
  return doors.filter(isDoorOpenForWork).length;
}
