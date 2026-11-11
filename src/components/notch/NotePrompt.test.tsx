import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", async () => (await import("./fixtures")).apiMock());

import * as api from "../../lib/api";
import type { ClosedEntry, TrackerSnapshot } from "../../lib/types";
import { atLocal } from "../../lib/dates";
import { useNotePrompt } from "../../stores/notePrompt";
import { useToasts } from "../../stores/toast";
import { useTracker } from "../../stores/tracker";
import { snapshot } from "./fixtures";
import { NotchApp } from "./NotchApp";
import { resetFocusRequests } from "./keyboard";

const flush = () => act(async () => {});
const state = () => document.querySelector("[data-view=notch]")?.getAttribute("data-state");
let hover: (h: boolean) => void;

const block = (min: number): ClosedEntry => ({
  id: 42,
  projectId: 2,
  start: atLocal("2026-11-11", "09:00"),
  end: atLocal("2026-11-11", "09:00") + min * 60_000,
});

async function mount(snap: TrackerSnapshot = snapshot()) {
  vi.mocked(api.getSnapshot).mockResolvedValue(snap);
  vi.mocked(api.getOverlayConfig).mockResolvedValue({ mode: "notch", notchWidth: 220, notchHeight: 38, pillWidth: 460, pillHeight: 38 });
  render(<NotchApp />);
  await flush();
}

async function openAndStop(closed: ClosedEntry | null) {
  vi.mocked(api.stopClock).mockResolvedValue(closed as never);
  act(() => hover(true));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Parar e encerrar" })));
}

describe("note prompt after stop/pause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFocusRequests();
    act(() => useToasts.getState().dismiss());
    act(() => useNotePrompt.getState().clear());
    useTracker.setState({ snapshot: null, snapAt: 0, now: 0 });
    vi.mocked(api.onOverlayHover).mockImplementation(async (cb) => ((hover = cb), () => {}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("asks what was done after Parar, with project and interval, and takes the keyboard", async () => {
    await mount();
    await openAndStop(block(90));
    expect(screen.getByText("O que você fez?")).toBeTruthy();
    expect(screen.getByText("Portal B2B · 09:00–10:30 (1h 30m)")).toBeTruthy();
    const field = screen.getByRole("textbox", { name: "Nota" });
    expect(document.activeElement).toBe(field);
    expect(api.overlayFocus).toHaveBeenCalled();
    // The undo toast for the stop is still offered.
    expect(useToasts.getState().current?.message).toBe("Relógio parado");
  });

  it("Enter saves the note and closes; Shift+Enter does not", async () => {
    vi.mocked(api.setEntryNote).mockResolvedValue({} as never);
    await mount();
    await openAndStop(block(30));
    const field = screen.getByRole("textbox", { name: "Nota" });
    fireEvent.change(field, { target: { value: "revisei o PR" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(api.setEntryNote).not.toHaveBeenCalled();
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    expect(api.setEntryNote).toHaveBeenCalledWith(42, "revisei o PR");
    expect(screen.queryByText("O que você fez?")).toBeNull();
  });

  it("Esc skips without saving, and the panel stays open while hovered", async () => {
    await mount();
    await openAndStop(block(30));
    await act(async () => fireEvent.keyDown(screen.getByRole("textbox", { name: "Nota" }), { key: "Escape" }));
    expect(api.setEntryNote).not.toHaveBeenCalled();
    expect(screen.queryByText("O que você fez?")).toBeNull();
    expect(state()).toBe("open");
  });

  it("Pular skips; the panel closes when not hovered", async () => {
    await mount();
    await openAndStop(block(30));
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(1000));
    // pinned while the field is open: hover-out does not close it
    expect(screen.getByText("O que você fez?")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pular" })));
    expect(api.setEntryNote).not.toHaveBeenCalled();
    expect(state()).toBe("closed");
  });

  it("is not shown for blocks under a minute or when nothing closed", async () => {
    await mount();
    await openAndStop(block(0.9));
    expect(screen.queryByText("O que você fez?")).toBeNull();
    await mount();
    await openAndStop(null);
    expect(screen.queryByText("O que você fez?")).toBeNull();
  });

  it("is offered after Pausar too", async () => {
    vi.mocked(api.pauseClock).mockResolvedValue(block(10) as never);
    await mount();
    act(() => hover(true));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pausar (espaço)" })));
    expect(screen.getByText("O que você fez?")).toBeTruthy();
  });

  it("is not offered when switching projects", async () => {
    await mount();
    act(() => hover(true));
    await act(async () => fireEvent.click(screen.getByText("Migração SAP")));
    expect(api.switchProject).toHaveBeenCalled();
    expect(screen.queryByText("O que você fez?")).toBeNull();
  });
});
