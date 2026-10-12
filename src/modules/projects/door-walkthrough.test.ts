import { describe, expect, it } from "vitest";
import { countDoorsOpenForWork, findNextDoor } from "./door-walkthrough";

const door = (id: string, status = "PENDING", is_locked = false) => ({ id, status, is_locked });

describe("findNextDoor", () => {
  const doors = [door("a"), door("b", "INSTALLED"), door("c", "NOT_INSTALLED"), door("d", "PENDING", true), door("e")];

  it("walks forward in display order, skipping installed and locked doors", () => {
    expect(findNextDoor(doors, "a")?.id).toBe("c");
    expect(findNextDoor(doors, "c")?.id).toBe("e");
  });

  it("wraps to the start and never returns the selected door", () => {
    expect(findNextDoor(doors, "e")?.id).toBe("a");
    expect(findNextDoor([door("only")], "only")).toBeNull();
    expect(findNextDoor([door("x", "INSTALLED"), door("y", "LOCKED")], "x")).toBeNull();
  });

  it("starts from the beginning when the selected door is not in view", () => {
    expect(findNextDoor(doors, "missing")?.id).toBe("a");
    expect(findNextDoor([], "a")).toBeNull();
  });
});

describe("countDoorsOpenForWork", () => {
  it("counts only doors an installer can still act on", () => {
    expect(countDoorsOpenForWork([door("a"), door("b", "INSTALLED"), door("c", "PENDING", true), door("d", "IN_PROGRESS")])).toBe(2);
  });
});
