import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { clock, dayLabel, dec, dur, hm, roundMs, weekdayShort } from "./format";

const H = 3_600_000;
const M = 60_000;

afterEach(() => setLang("pt-BR"));

describe("format", () => {
  it("dec mirrors fmt_hours", () => {
    expect(dec(5.5 * H)).toBe("5,5");
    expect(dec(7.25 * H)).toBe("7,25");
    expect(dec(8 * H)).toBe("8");
    expect(dec(H / 3)).toBe("0,33");
    expect(dec(2 * H / 3)).toBe("0,67");
    expect(dec(0)).toBe("");
  });
  it("dec uses the language's decimal separator", () => {
    expect(dec(5.5 * H, "en")).toBe("5.5");
    expect(dec(7.25 * H, "en")).toBe("7.25");
    expect(dec(-H / 2, "en")).toBe("-0.5");
    expect(dec(5.5 * H, "es")).toBe("5,5");
    expect(dec(5.5 * H, "pt-BR")).toBe("5,5");
    setLang("en");
    expect(dec(5.5 * H)).toBe("5.5");
    setLang("es");
    expect(dec(5.5 * H)).toBe("5,5");
  });
  it("day labels per language", () => {
    setLang("en");
    expect(dayLabel("2026-11-10")).toBe("Nov 10");
    expect(weekdayShort(0)).toBe("Mon");
    setLang("es");
    expect(dayLabel("2026-11-10")).toBe("10 nov");
    expect(weekdayShort(0)).toBe("Lun");
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

  it("roundMs rounds to nearest, half up", () => {
    const m = 60_000;
    expect(roundMs(130 * m, 0)).toBe(130 * m);
    expect(roundMs(130 * m, 15)).toBe(135 * m);
    expect(roundMs(130 * m, 30)).toBe(120 * m);
    expect(roundMs(135 * m, 30)).toBe(150 * m);
  });
});
