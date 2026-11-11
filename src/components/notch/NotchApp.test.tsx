import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", async () => (await import("./fixtures")).apiMock());

import * as api from "../../lib/api";
import type { OverlayConfig, TrackerSnapshot } from "../../lib/types";
import { useTracker } from "../../stores/tracker";
import { snapshot } from "./fixtures";
import { NotchApp } from "./NotchApp";

const notch: OverlayConfig = { mode: "notch", notchWidth: 220, notchHeight: 38, pillWidth: 460, pillHeight: 38 };
const strip: OverlayConfig = { mode: "strip", notchWidth: null, notchHeight: null, pillWidth: 160, pillHeight: 6 };

let hover: (h: boolean) => void;
let expanded: (e: boolean) => void;
let changed: (s: TrackerSnapshot) => void;
let focusSearch: () => void;
const flush = () => act(async () => {});
const state = () => document.querySelector("[data-view=notch]")?.getAttribute("data-state");

async function mount(config: OverlayConfig = notch, snap = snapshot()) {
  vi.mocked(api.getSnapshot).mockResolvedValue(snap);
  vi.mocked(api.getOverlayConfig).mockResolvedValue(config);
  render(<NotchApp />);
  await flush();
}

describe("NotchApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTracker.setState({ snapshot: null, snapAt: 0, now: 0 });
    vi.mocked(api.onOverlayHover).mockImplementation(async (cb) => ((hover = cb), () => {}));
    vi.mocked(api.onOverlayExpanded).mockImplementation(async (cb) => ((expanded = cb), () => {}));
    vi.mocked(api.onChanged).mockImplementation(async (cb) => ((changed = cb), () => {}));
    vi.mocked(api.onOverlayFocusSearch).mockImplementation(async (cb) => ((focusSearch = cb), () => {}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("renders the pill with project and clock in the ears and reports its rect", async () => {
    await mount();
    expect(state()).toBe("closed");
    expect(screen.getByText("Portal B2B")).toBeTruthy();
    expect(screen.getByText("1:00:00")).toBeTruthy();
    expect(api.overlaySetHitRect).toHaveBeenCalled();
  });

  it("idle pill says no project is running", async () => {
    await mount(notch, snapshot({ status: "idle", sessionProject: null, sessionMs: 0, runningSince: null }));
    expect(screen.getByText("Sem projeto")).toBeTruthy();
    expect(screen.getByText("rodando")).toBeTruthy();
  });

  it("opens on hover and closes 450 ms after the hover ends", async () => {
    await mount();
    act(() => hover(true));
    expect(state()).toBe("open");
    expect(api.overlaySetExpanded).toHaveBeenLastCalledWith(true);
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(440));
    expect(state()).toBe("open");
    act(() => hover(true));
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(460));
    expect(state()).toBe("closed");
    expect(api.overlaySetExpanded).toHaveBeenLastCalledWith(false);
  });

  it("a click inside pins the panel; Esc closes it", async () => {
    await mount();
    act(() => hover(true));
    fireEvent.pointerDown(screen.getByText("Ver horas da semana"));
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(1000));
    expect(state()).toBe("open");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state()).toBe("closed");
  });

  it("overlay://expanded opens pinned; false closes", async () => {
    await mount();
    act(() => expanded(true));
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(1000));
    expect(state()).toBe("open");
    act(() => expanded(false));
    expect(state()).toBe("closed");
  });

  it("overlay://focus-search opens and focuses the search field", async () => {
    await mount();
    act(() => focusSearch());
    expect(state()).toBe("open");
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Trocar para… ou criar projeto"));
  });

  it("footer action opens the window and closes the panel", async () => {
    await mount();
    act(() => expanded(true));
    await act(async () => fireEvent.click(screen.getByText("Configurações")));
    expect(api.openWindow).toHaveBeenCalledWith("settings");
    expect(state()).toBe("closed");
  });

  it("a pending absence replaces the panel and keeps it open", async () => {
    await mount();
    act(() =>
      changed(snapshot({ pendingAbsence: { start: 0, end: 3_600_000, reason: "sleep", projectId: 2 } })),
    );
    expect(state()).toBe("open");
    expect(screen.getByText("Notebook fechado ou em repouso")).toBeTruthy();
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(1000));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state()).toBe("open");
  });

  it("strip mode: thin bar grows to the pill on hover, then opens", async () => {
    await mount(strip);
    const bar = document.querySelector("[data-pill=strip]") as HTMLElement;
    expect(bar).toBeTruthy();
    act(() => hover(true));
    expect(document.querySelector("[data-pill=strip]")).toBeNull();
    expect(screen.getByText("Portal B2B")).toBeTruthy();
    expect(state()).toBe("closed");
    act(() => void vi.advanceTimersByTime(400));
    expect(state()).toBe("open");
  });

  it("create view: Criar e iniciar creates and switches", async () => {
    vi.mocked(api.createProject).mockResolvedValue({ id: 9, name: "Novo", client: "Acme", color: "#3ddc84", archived: false });
    await mount();
    act(() => expanded(true));
    fireEvent.change(screen.getByPlaceholderText("Trocar para… ou criar projeto"), { target: { value: "Novo" } });
    fireEvent.click(screen.getByText("＋ Criar projeto “Novo”"));
    expect((screen.getByPlaceholderText("Nome do projeto") as HTMLInputElement).value).toBe("Novo");
    fireEvent.click(screen.getByRole("button", { name: "Acme" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Criar e iniciar" })));
    expect(api.createProject).toHaveBeenCalledWith("Novo", "Acme", expect.any(String));
    expect(api.switchProject).toHaveBeenCalledWith(9);
  });
});
