import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

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
let restCb: () => void;
let focusSearch: () => void;

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
  hoverIn();
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
    vi.mocked(api.onOverlayRest).mockImplementation(async (cb) => ((restCb = cb), () => {}));
    vi.mocked(api.onOverlayFocusSearch).mockImplementation(async (cb) => ((focusSearch = cb), () => {}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("asks what was done after Parar, with project and interval, and takes the keyboard", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await mount();
    await openAndStop(block(90));
    await flush();
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
    cleanup();
    await mount();
    await openAndStop(null);
    expect(screen.queryByText("O que você fez?")).toBeNull();
  });

  it("is offered after Pausar too", async () => {
    vi.mocked(api.pauseClock).mockResolvedValue(block(10) as never);
    await mount();
    hoverIn();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pausar (espaço)" })));
    expect(screen.getByText("O que você fez?")).toBeTruthy();
  });

  it("is not offered when switching projects", async () => {
    await mount();
    hoverIn();
    await act(async () => fireEvent.click(screen.getByText("Migração SAP")));
    expect(api.switchProject).toHaveBeenCalled();
    expect(screen.queryByText("O que você fez?")).toBeNull();
  });

  it("window-level Esc (focus on Pular) skips the note and closes", async () => {
    await mount();
    await openAndStop(block(30));
    const skip = screen.getByRole("button", { name: "Pular" });
    skip.focus();
    await act(async () => fireEvent.keyDown(skip, { key: "Escape" }));
    expect(api.setEntryNote).not.toHaveBeenCalled();
    expect(screen.queryByText("O que você fez?")).toBeNull();
    expect(useNotePrompt.getState().closed).toBeNull();
    expect(state()).toBe("closed");
  });

  it("losing key focus skips the note and closes the panel", async () => {
    await mount();
    await openAndStop(block(30));
    await act(async () => void window.dispatchEvent(new Event("blur")));
    expect(api.setEntryNote).not.toHaveBeenCalled();
    expect(useNotePrompt.getState().closed).toBeNull();
    expect(state()).toBe("closed");
  });

  it("clicking the field while the overlay is not key asks for the keyboard", async () => {
    await mount();
    await openAndStop(block(30));
    vi.mocked(api.overlayFocus).mockClear();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await act(async () => void fireEvent.mouseDown(screen.getByRole("textbox", { name: "Nota" })));
    expect(api.overlayFocus).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Nota" }));
  });

  it("opening the prompt never focuses the search afterwards", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await mount();
    await openAndStop(block(30));
    await flush();
    // overlay_focus echoes overlay://focus-search: it must be ignored
    act(() => focusSearch());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pular" })));
    await flush();
    expect(state()).toBe("open");
    // close and reopen by hover: a stale focus request would focus the search now
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(500));
    expect(state()).toBe("closed");
    hoverIn();
    act(() => void vi.advanceTimersByTime(100)); // undo-toast hover grace
    await flush();
    expect(state()).toBe("open");
    const search = screen.getByPlaceholderText("Trocar para… ou criar projeto");
    expect(document.activeElement).not.toBe(search);
  });

  it("a failed save keeps the prompt and the text, and toasts the error", async () => {
    vi.mocked(api.setEntryNote).mockRejectedValue("Erro ao acessar os dados: disco cheio");
    await mount();
    await openAndStop(block(30));
    const field = screen.getByRole("textbox", { name: "Nota" }) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "deploy" } });
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }));
    await flush();
    expect(api.setEntryNote).toHaveBeenCalledWith(42, "deploy");
    expect(screen.getByText("O que você fez?")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Nota" }) as HTMLTextAreaElement).value).toBe("deploy");
    expect(useToasts.getState().current?.message).toBe("Erro ao acessar os dados: disco cheio");
  });

  it("Enter then Salvar while saving sends the note once", async () => {
    let done!: () => void;
    vi.mocked(api.setEntryNote).mockImplementation(() => new Promise((r) => (done = () => r({} as never))));
    await mount();
    await openAndStop(block(30));
    const field = screen.getByRole("textbox", { name: "Nota" });
    fireEvent.change(field, { target: { value: "deploy" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(api.setEntryNote).toHaveBeenCalledTimes(1);
    await act(async () => done());
    expect(screen.queryByText("O que você fez?")).toBeNull();
  });
});

function hoverIn() {
  act(() => hover(true));
  act(() => restCb());
}
