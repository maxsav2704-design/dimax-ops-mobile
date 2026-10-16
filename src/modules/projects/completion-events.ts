type CompletionDoor = { id: string; status: string; floor_label: string | null };

export type CompletionEvent =
  | { kind: "floor"; floor: string; installed: number; total: number }
  | { kind: "project"; installed: number; total: number };

const NO_FLOOR = "";

function byFloor(doors: ReadonlyArray<CompletionDoor>): Map<string, CompletionDoor[]> {
  const groups = new Map<string, CompletionDoor[]>();
  for (const door of doors) {
    const floor = door.floor_label || NO_FLOOR;
    groups.set(floor, [...(groups.get(floor) || []), door]);
  }
  return groups;
}

const installed = (doors: ReadonlyArray<CompletionDoor>) => doors.filter((door) => door.status === "INSTALLED").length;
const complete = (doors: ReadonlyArray<CompletionDoor>) => doors.length > 0 && installed(doors) === doors.length;

/**
 * Completion moments between two door snapshots: a floor or the whole project that was not
 * complete before and is complete now. A project completion supersedes its floor events.
 */
export function detectCompletionEvents(
  previous: ReadonlyArray<CompletionDoor>,
  next: ReadonlyArray<CompletionDoor>,
): CompletionEvent[] {
  if (!previous.length || !next.length) return [];
  if (!complete(previous) && complete(next)) {
    return [{ kind: "project", installed: installed(next), total: next.length }];
  }
  const before = byFloor(previous);
  const events: CompletionEvent[] = [];
  for (const [floor, doors] of byFloor(next)) {
    const earlier = before.get(floor);
    if (earlier && !complete(earlier) && complete(doors)) {
      events.push({ kind: "floor", floor, installed: installed(doors), total: doors.length });
    }
  }
  return events;
}

/** The next floor (in display order) that still has a door open for work, wrapping around. */
export function nextOpenFloor(floorsInOrder: ReadonlyArray<[string, ReadonlyArray<{ status: string; is_locked: boolean }>]>, after: string): string | null {
  if (!floorsInOrder.length) return null;
  const start = floorsInOrder.findIndex(([floor]) => floor === after);
  for (let step = 1; step <= floorsInOrder.length; step += 1) {
    const [floor, doors] = floorsInOrder[(start + step) % floorsInOrder.length];
    if (floor !== after && doors.some((door) => !door.is_locked && door.status !== "INSTALLED" && door.status !== "LOCKED")) return floor;
  }
  return null;
}
