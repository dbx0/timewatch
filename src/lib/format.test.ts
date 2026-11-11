import { describe, expect, it } from "vitest";
import { clock, dayLabel, dec, dur, hm, weekdayShort } from "./format";

const H = 3_600_000;
const M = 60_000;

describe("format", () => {
  it("dec mirrors fmt_hours", () => {
    expect(dec(5.5 * H)).toBe("5,5");
    expect(dec(7.25 * H)).toBe("7,25");
    expect(dec(8 * H)).toBe("8");
    expect(dec(H / 3)).toBe("0,33");
    expect(dec(2 * H / 3)).toBe("0,67");
    expect(dec(0)).toBe("");
  });
  it("dur", () => {
    expect(dur(5 * H + 40 * M)).toBe("5h 40m");
    expect(dur(45 * M)).toBe("45m");
    expect(dur(2 * H)).toBe("2h");
  });
  it("clock", () => {
    expect(clock(8047000)).toBe("2:14:07");
    expect(clock(0)).toBe("0:00:00");
  });
  it("hm", () => {
    expect(hm(new Date(2026, 10, 11, 9, 5).getTime())).toBe("09:05");
    expect(hm(new Date(2026, 10, 11, 13, 40).getTime())).toBe("13:40");
  });
  it("dayLabel and weekdayShort", () => {
    expect(dayLabel(new Date(2026, 10, 10))).toBe("10 nov");
    expect(dayLabel("2026-11-10")).toBe("10 nov");
    expect(weekdayShort(0)).toBe("Seg");
    expect(weekdayShort(6)).toBe("Dom");
  });
});
