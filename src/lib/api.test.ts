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
});
