import { create } from "zustand";
import type { ClosedEntry } from "../lib/types";

/** Blocks shorter than this never ask for a note. */
export const NOTE_MIN_MS = 60_000;

interface NotePromptState {
  /** The block the notch is asking about, if any. */
  closed: ClosedEntry | null;
  /** Asks about `c` (ignored when null or shorter than `NOTE_MIN_MS`). */
  ask: (c: ClosedEntry | null | undefined) => void;
  clear: () => void;
}

export const useNotePrompt = create<NotePromptState>((set) => ({
  closed: null,
  ask: (c) => {
    if (c && c.end - c.start >= NOTE_MIN_MS) set({ closed: c });
  },
  clear: () => set({ closed: null }),
}));
