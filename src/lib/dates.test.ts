import { describe, expect, it } from "vitest";
import { addDays, atLocal, mondayOf, toIso, weekOrder, weekStartOf } from "./dates";

describe("dates", () => {
  it("finds the Monday of a week, including Sunday", () => {
    expect(mondayOf("2026-11-11")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
  });
  it("finds the start of a Saturday or Monday week", () => {
    expect(weekStartOf("2026-11-07", "saturday")).toBe("2026-11-07");
    expect(weekStartOf("2026-11-13", "saturday")).toBe("2026-11-07");
    expect(weekStartOf("2026-11-15", "saturday")).toBe("2026-11-14");
    expect(weekStartOf("2026-11-15", "monday")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-15", undefined)).toBe("2026-11-09");
    expect(weekOrder("saturday")).toEqual([5, 6, 0, 1, 2, 3, 4]);
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("formats local dates", () => {
    expect(toIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("builds local epoch ms from day and HH:MM", () => {
    const d = new Date(atLocal("2026-11-11", "17:30"));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 11, 17, 30]);
  });
});
