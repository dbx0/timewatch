import { describe, expect, it } from "vitest";
import { atLocal } from "../../lib/dates";
import { entrySlot } from "./entrySlot";

const D = "2026-11-11";
const at = (hhmm: string) => atLocal(D, hhmm);
const seg = (a: string, b: string, running = false) => ({ start: at(a), end: at(b), running });

describe("entrySlot", () => {
  it("past day: one hour after the last entry, 09:00 on an empty day", () => {
    expect(entrySlot(D, "2026-11-13", 0, [seg("09:00", "12:00")])).toEqual([at("12:00"), at("13:00")]);
    expect(entrySlot(D, "2026-11-13", 0, [])).toEqual([at("09:00"), at("10:00")]);
  });

  it("past day: capped at 23:59", () => {
    expect(entrySlot(D, "2026-11-13", 0, [seg("09:00", "23:30")])).toEqual([at("23:30"), at("23:59")]);
  });

  it("today: the end never passes now", () => {
    expect(entrySlot(D, D, at("12:20") + 30_000, [seg("09:00", "12:00")])).toEqual([at("12:00"), at("12:20")]);
  });

  it("today with the clock running: uses an earlier gap", () => {
    // 09-12 closed, 13:00-now running: the lunch gap gets the entry.
    expect(entrySlot(D, D, at("15:00"), [seg("09:00", "12:00"), seg("13:00", "15:00", true)])).toEqual([
      at("12:00"),
      at("13:00"),
    ]);
  });

  it("today, running since the first entry: the hour before it", () => {
    expect(entrySlot(D, D, at("15:00"), [seg("09:00", "15:00", true)])).toEqual([at("08:00"), at("09:00")]);
  });

  it("today, before 09:00 on an empty day: the hour up to now", () => {
    expect(entrySlot(D, D, at("08:30"), [])).toEqual([at("07:30"), at("08:30")]);
  });

  it("does not overlap a marked lunch", () => {
    expect(entrySlot(D, "2026-11-13", 0, [seg("09:00", "12:00"), seg("12:30", "13:00")])).toEqual([
      at("13:00"),
      at("14:00"),
    ]);
  });

  it("a short gap is filled only up to the next entry", () => {
    expect(entrySlot(D, D, at("15:00"), [seg("00:00", "12:00"), seg("12:10", "15:00", true)])).toEqual([
      at("12:00"),
      at("12:10"),
    ]);
  });

  it("no room: null (gaps under a minute do not count)", () => {
    expect(entrySlot(D, D, at("00:00") + 30_000, [])).toBeNull();
    expect(entrySlot(D, D, at("15:00"), [seg("00:00", "15:00", true)])).toBeNull();
  });

  it("future days: null", () => {
    expect(entrySlot("2026-11-14", D, at("15:00"), [])).toBeNull();
  });
});
