import { beforeEach, describe, expect, it } from "vitest";
import { liveSessionMs, liveTodayMs, useTracker } from "./tracker";
import { snapshot } from "../components/notch/fixtures";

const H = 3_600_000;

describe("tracker store", () => {
  beforeEach(() => useTracker.setState({ snapshot: null, snapAt: 0, now: 0 }));

  it("derives the live session time while running", () => {
    useTracker.getState().setSnapshot(snapshot({ sessionMs: H }), 10_000);
    expect(liveSessionMs(useTracker.getState())).toBe(H);
    useTracker.getState().setNow(15_000);
    expect(liveSessionMs(useTracker.getState())).toBe(H + 5_000);
    expect(liveTodayMs(useTracker.getState())).toBe(3 * H + 5_000);
  });

  it("freezes the session time while paused or idle", () => {
    useTracker.getState().setSnapshot(snapshot({ status: "paused", sessionMs: H, runningSince: null }), 10_000);
    useTracker.getState().setNow(70_000);
    expect(liveSessionMs(useTracker.getState())).toBe(H);
    useTracker.getState().setSnapshot(snapshot({ status: "idle", sessionMs: 0, sessionProject: null }), 10_000);
    useTracker.getState().setNow(70_000);
    expect(liveSessionMs(useTracker.getState())).toBe(0);
  });

  it("never goes back when a tick is older than the snapshot", () => {
    useTracker.getState().setSnapshot(snapshot({ sessionMs: H }), 10_000);
    useTracker.getState().setNow(9_000);
    expect(liveSessionMs(useTracker.getState())).toBe(H);
  });
});
