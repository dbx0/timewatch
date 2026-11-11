import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", async () => (await import("./fixtures")).apiMock());

import * as api from "../../lib/api";
import type { OverlayConfig, TrackerSnapshot } from "../../lib/types";
import { useTracker } from "../../stores/tracker";
import { snapshot } from "./fixtures";
import { NotchApp } from "./NotchApp";
import { resetFocusRequests } from "./keyboard";
import { toast, useToasts } from "../../stores/toast";

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
    resetFocusRequests();
    act(() => useToasts.getState().dismiss());
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

  it("a plain click (project row) does not pin: hover-out still closes", async () => {
    await mount();
    act(() => hover(true));
    const row = screen.getByText("Migração SAP");
    fireEvent.pointerDown(row);
    await act(async () => fireEvent.click(row));
    expect(api.switchProject).toHaveBeenCalledWith(1);
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(460));
    expect(state()).toBe("closed");
    expect(api.overlayFocus).not.toHaveBeenCalled();
  });

  it("focusing the search pins and takes keyboard focus; Esc closes", async () => {
    await mount();
    act(() => hover(true));
    act(() => screen.getByPlaceholderText("Trocar para… ou criar projeto").focus());
    expect(api.overlayFocus).toHaveBeenCalledTimes(1);
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(1000));
    expect(state()).toBe("open");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state()).toBe("closed");
  });

  it("blur closes a pinned panel but not a hover-opened one", async () => {
    await mount();
    act(() => hover(true));
    fireEvent.blur(window);
    expect(state()).toBe("open");
    act(() => expanded(true));
    fireEvent.blur(window);
    expect(state()).toBe("closed");
  });

  it("clicking the pill area of the open panel closes it", async () => {
    await mount();
    act(() => expanded(true));
    fireEvent.click(document.querySelector("[data-pill-area]") as HTMLElement);
    expect(state()).toBe("closed");
  });

  it("overlay://expanded opens pinned with keyboard focus; false closes", async () => {
    await mount();
    act(() => expanded(true));
    expect(api.overlayFocus).toHaveBeenCalledTimes(1);
    // The echo of our own overlay_focus does not ask again.
    act(() => expanded(true));
    expect(api.overlayFocus).toHaveBeenCalledTimes(1);
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

describe("NotchApp toast under the collapsed pill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFocusRequests();
    useTracker.setState({ snapshot: null, snapAt: 0, now: 0 });
    vi.mocked(api.onOverlayHover).mockImplementation(async (cb) => ((hover = cb), () => {}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    act(() => useToasts.getState().dismiss());
    vi.useRealTimers();
  });

  it("hovering the undo toast does not open the panel", async () => {
    await mount();
    act(() => toast("Relógio parado", { undo: () => {} }));
    fireEvent.pointerEnter(document.querySelector("[data-hit=toast]") as HTMLElement);
    act(() => hover(true));
    act(() => void vi.advanceTimersByTime(200));
    expect(state()).toBe("closed");
    fireEvent.pointerLeave(document.querySelector("[data-hit=toast]") as HTMLElement);
    fireEvent.pointerEnter(document.querySelector("[data-hit=surface]") as HTMLElement);
    expect(state()).toBe("open");
  });

  it("with an undo toast, hovering the pill still opens", async () => {
    await mount();
    act(() => toast("Relógio parado", { undo: () => {} }));
    act(() => hover(true));
    act(() => void vi.advanceTimersByTime(100));
    expect(state()).toBe("open");
  });
});

describe("NotchApp hit rect", () => {
  const W = 520;
  const sizeOf = (el: HTMLElement): [number, number] => {
    if (el.dataset.hit === "surface") {
      const c = el.firstElementChild as HTMLElement | null;
      if (!c) return [0, 0];
      if (c.hasAttribute("data-panel")) return [440, 500];
      const kind = c.dataset.pill;
      return kind === "notch" ? [460, 38] : kind === "strip" ? [160, 6] : kind === "grown" ? [280, 32] : [0, 0];
    }
    if (el.dataset.hit === "toast") return el.querySelector("[role=status]") ? [200, 40] : [0, 0];
    return [0, 0];
  };
  const topOf = (el: HTMLElement): number => {
    if (el.dataset.hit !== "toast") return 0;
    const prev = el.previousElementSibling as HTMLElement;
    return sizeOf(prev)[1] + (el.classList.contains("mt-2") ? 8 : 0);
  };
  const descs: Record<string, PropertyDescriptor | undefined> = {};
  const props: Record<string, (el: HTMLElement) => number> = {
    offsetWidth: (el) => sizeOf(el)[0],
    offsetHeight: (el) => sizeOf(el)[1],
    offsetLeft: (el) => (W - sizeOf(el)[0]) / 2,
    offsetTop: topOf,
  };
  const last = () => vi.mocked(api.overlaySetHitRect).mock.lastCall?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    resetFocusRequests();
    useTracker.setState({ snapshot: null, snapAt: 0, now: 0 });
    vi.mocked(api.onOverlayHover).mockImplementation(async (cb) => ((hover = cb), () => {}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const [k, f] of Object.entries(props)) {
      descs[k] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
      Object.defineProperty(HTMLElement.prototype, k, {
        configurable: true,
        get(this: HTMLElement) {
          return f(this);
        },
      });
    }
  });
  afterEach(() => {
    act(() => useToasts.getState().dismiss());
    vi.useRealTimers();
    for (const k of Object.keys(props)) Object.defineProperty(HTMLElement.prototype, k, descs[k]!);
  });

  it("pill when collapsed, panel when open, pill again after closing", async () => {
    await mount();
    expect(last()).toEqual({ x: 30, y: 0, w: 460, h: 38 });
    act(() => hover(true));
    expect(last()).toEqual({ x: 40, y: 0, w: 440, h: 500 });
    act(() => hover(false));
    act(() => void vi.advanceTimersByTime(460));
    expect(last()).toEqual({ x: 30, y: 0, w: 460, h: 38 });
  });

  it("strip: bar, then the grown pill on hover", async () => {
    await mount(strip);
    expect(last()).toEqual({ x: 180, y: 0, w: 160, h: 6 });
    act(() => hover(true));
    expect(last()).toEqual({ x: 120, y: 0, w: 280, h: 32 });
  });

  it("includes the toast only while it offers undo, with no gap under the pill", async () => {
    await mount();
    act(() => toast("Agora em X"));
    expect(last()).toEqual({ x: 30, y: 0, w: 460, h: 38 });
    act(() => toast("Relógio parado", { undo: () => {} }));
    expect(last()).toEqual({ x: 30, y: 0, w: 460, h: 78 });
    act(() => useToasts.getState().dismiss());
    expect(last()).toEqual({ x: 30, y: 0, w: 460, h: 38 });
  });
});
