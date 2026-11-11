import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (...a: unknown[]) => listen(...a) }));

import * as api from "./api";

describe("api", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    listen.mockReset();
  });

  it("switchProject invokes switch_project", async () => {
    await api.switchProject(3);
    expect(invoke).toHaveBeenCalledWith("switch_project", { projectId: 3 });
  });

  it("getWeek invokes get_week", async () => {
    await api.getWeek("2026-11-09", "client");
    expect(invoke).toHaveBeenCalledWith("get_week", { weekStart: "2026-11-09", grouping: "client" });
  });

  it("resolveAbsence sends tagged resolution", async () => {
    await api.resolveAbsence({ kind: "moveTo", projectId: 2 });
    expect(invoke).toHaveBeenCalledWith("resolve_absence", {
      resolution: { kind: "moveTo", projectId: 2 },
    });
  });

  it("exportWeek passes all args", async () => {
    await api.exportWeek("2026-11-09", "project", "csv", true, "/tmp/x.csv");
    expect(invoke).toHaveBeenCalledWith("export_week", {
      weekStart: "2026-11-09",
      grouping: "project",
      format: "csv",
      detailed: true,
      path: "/tmp/x.csv",
    });
  });

  it("updateEntry sends nulls for omitted fields", async () => {
    await api.updateEntry(5, { end: 99 });
    expect(invoke).toHaveBeenCalledWith("update_entry", {
      id: 5,
      start: null,
      end: 99,
      projectId: null,
    });
  });

  it("onChanged and onTick unwrap the payload", async () => {
    const unlisten = vi.fn();
    listen.mockResolvedValue(unlisten);
    const cb = vi.fn();
    const un = await api.onTick(cb);
    expect(listen.mock.calls[0][0]).toBe("tracker://tick");
    listen.mock.calls[0][1]({ payload: { now: 7 } });
    expect(cb).toHaveBeenCalledWith(7);
    await api.onChanged(cb);
    expect(listen.mock.calls[1][0]).toBe("tracker://changed");
    expect(un).toBe(unlisten);
  });

  it("overlay commands pass their args", async () => {
    await api.overlaySetHitRect({ x: 1, y: 2, w: 3, h: 4 });
    expect(invoke).toHaveBeenCalledWith("overlay_set_hit_rect", { rect: { x: 1, y: 2, w: 3, h: 4 } });
    await api.overlaySetHitRect(null);
    expect(invoke).toHaveBeenCalledWith("overlay_set_hit_rect", { rect: null });
    await api.overlaySetExpanded(false);
    expect(invoke).toHaveBeenCalledWith("overlay_set_expanded", { expanded: false });
    await api.overlayFocus();
    expect(invoke).toHaveBeenCalledWith("overlay_focus");
    await api.getOverlayConfig();
    expect(invoke).toHaveBeenCalledWith("get_overlay_config");
  });

  it("overlay events unwrap the payload", async () => {
    listen.mockResolvedValue(vi.fn());
    const hover = vi.fn();
    const expanded = vi.fn();
    const config = vi.fn();
    const focus = vi.fn();
    await api.onOverlayHover(hover);
    await api.onOverlayExpanded(expanded);
    await api.onOverlayConfig(config);
    await api.onOverlayFocusSearch(focus);
    expect(listen.mock.calls.map((c) => c[0])).toEqual([
      "overlay://hover",
      "overlay://expanded",
      "overlay://config",
      "overlay://focus-search",
    ]);
    listen.mock.calls[0][1]({ payload: true });
    listen.mock.calls[1][1]({ payload: { expanded: false, focus: false } });
    listen.mock.calls[2][1]({ payload: { mode: "notch", notchWidth: 185, notchHeight: 32, pillWidth: 425, pillHeight: 32 } });
    listen.mock.calls[3][1]({ payload: null });
    expect(hover).toHaveBeenCalledWith(true);
    expect(expanded).toHaveBeenCalledWith({ expanded: false, focus: false });
    expect(config).toHaveBeenCalledWith({ mode: "notch", notchWidth: 185, notchHeight: 32, pillWidth: 425, pillHeight: 32 });
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
