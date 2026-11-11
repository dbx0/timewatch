import { create } from "zustand";
import { getSnapshot } from "../lib/api";
import type { TrackerSnapshot } from "../lib/types";

interface TrackerState {
  snapshot: TrackerSnapshot | null;
  /** Wall-clock ms when the snapshot was received (the backend computed it at about this time). */
  snapAt: number;
  /** Latest `tracker://tick`. */
  now: number;
  setSnapshot: (s: TrackerSnapshot, at?: number) => void;
  setNow: (now: number) => void;
  refresh: () => Promise<void>;
}

export const useTracker = create<TrackerState>((set) => ({
  snapshot: null,
  snapAt: 0,
  now: 0,
  setSnapshot: (snapshot, at = Date.now()) => set({ snapshot, snapAt: at, now: at }),
  setNow: (now) => set({ now }),
  refresh: async () => {
    const s = await getSnapshot();
    set({ snapshot: s, snapAt: Date.now(), now: Date.now() });
  },
}));

type Live = Pick<TrackerState, "snapshot" | "snapAt" | "now">;

/** Time elapsed since the snapshot while a block is open (the snapshot already counts up to `snapAt`). */
const runningDelta = (s: Live) =>
  s.snapshot?.status === "running" ? Math.max(0, s.now - s.snapAt) : 0;

/** Session clock: `snapshot.sessionMs` (closed blocks + open block up to the snapshot) plus the time since. */
export const liveSessionMs = (s: Live) => (s.snapshot ? s.snapshot.sessionMs + runningDelta(s) : 0);
export const liveTodayMs = (s: Live) => (s.snapshot ? s.snapshot.todayMs + runningDelta(s) : 0);
/** Extra ms to add to the running project's today time. */
export const liveDelta = runningDelta;
