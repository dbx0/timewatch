import { create } from "zustand";

export interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

interface ToastState {
  current: ToastItem | null;
  show: (message: string, opts?: { undo?: () => void }) => void;
  dismiss: () => void;
}

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useToasts = create<ToastState>((set) => ({
  current: null,
  show: (message, opts) => {
    clearTimeout(timer);
    const id = ++seq;
    set({ current: { id, message, undo: opts?.undo } });
    timer = setTimeout(() => set({ current: null }), opts?.undo ? 5000 : 2400);
  },
  dismiss: () => {
    clearTimeout(timer);
    set({ current: null });
  },
}));

export function toast(message: string, opts?: { undo?: () => void }) {
  useToasts.getState().show(message, opts);
}
