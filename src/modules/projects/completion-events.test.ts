import { describe, expect, it } from "vitest";
import { detectCompletionEvents, nextOpenFloor } from "./completion-events";

const door = (id: string, floor: string | null, status = "PENDING") => ({ id, floor_label: floor, status });

describe("detectCompletionEvents", () => {
  it("reports a floor that just became complete, once", () => {
    const before = [door("a", "2", "INSTALLED"), door("b", "2"), door("c", "3")];
    const after = [door("a", "2", "INSTALLED"), door("b", "2", "INSTALLED"), door("c", "3")];
    expect(detectCompletionEvents(before, after)).toEqual([{ kind: "floor", floor: "2", installed: 2, total: 2 }]);
    expect(detectCompletionEvents(after, after)).toEqual([]);
  });

  it("reports the project instead of its last floor when everything is complete", () => {
    const before = [door("a", "2", "INSTALLED"), door("c", "3")];
    const after = [door("a", "2", "INSTALLED"), door("c", "3", "INSTALLED")];
    expect(detectCompletionEvents(before, after)).toEqual([{ kind: "project", installed: 2, total: 2 }]);
  });

  it("ignores initial loads, empty snapshots and floors that were already complete", () => {
    const complete = [door("a", "2", "INSTALLED")];
    expect(detectCompletionEvents([], complete)).toEqual([]);
    expect(detectCompletionEvents(complete, [])).toEqual([]);
    expect(detectCompletionEvents(complete, [...complete, door("b", "3")])).toEqual([]);
    expect(detectCompletionEvents([door("x", null)], [door("x", null, "INSTALLED"), door("y", "1")]))
      .toEqual([{ kind: "floor", floor: "", installed: 1, total: 1 }]);
  });
});

describe("nextOpenFloor", () => {
  const floors: Array<[string, Array<{ status: string; is_locked: boolean }>]> = [
    ["1", [{ status: "INSTALLED", is_locked: true }]],
    ["2", [{ status: "INSTALLED", is_locked: true }]],
    ["3", [{ status: "PENDING", is_locked: false }]],
    ["4", [{ status: "LOCKED", is_locked: true }]],
  ];

  it("walks forward to the next floor with open work and wraps around", () => {
    expect(nextOpenFloor(floors, "2")).toBe("3");
    expect(nextOpenFloor(floors, "3")).toBeNull();
    expect(nextOpenFloor(floors, "4")).toBe("3");
    expect(nextOpenFloor([], "1")).toBeNull();
  });
});
