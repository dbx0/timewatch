import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../../lib/api", () => ({
  getWeek: vi.fn(),
  getDay: vi.fn(),
  getSnapshot: vi.fn(),
  getSettings: vi.fn(),
  addEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  unmarkLunch: vi.fn(),
  undo: vi.fn(),
  exportWeek: vi.fn(),
  onChanged: vi.fn(),
  onTick: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

import * as api from "../../lib/api";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { useToasts } from "../../stores/toast";
import { atLocal } from "../../lib/dates";
import { H, dayCalc, projects, week } from "./fixtures";
import { ReportApp } from "./ReportApp";
import type { DayCalc, Settings } from "../../lib/types";

const flush = () => act(async () => {});
let changed: () => void;
let tick: (now: number) => void;

const settings = { lunchMin: 60, lunchRef: "12:00:00" } as Settings;

function day(over: Partial<DayCalc> = {}) {
  vi.mocked(api.getDay).mockResolvedValue({ day: dayCalc(over), projects });
}

async function mount() {
  render(<ReportApp />);
  await flush();
}

describe("ReportApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    act(() => useToasts.getState().dismiss());
    vi.mocked(api.getWeek).mockImplementation(async (_w, grouping) => week({ grouping }));
    vi.mocked(api.getSnapshot).mockResolvedValue({ recents: [{ project: projects[1] }], projects } as never);
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.onChanged).mockImplementation(async (cb) => ((changed = () => cb({} as never)), () => {}));
    vi.mocked(api.onTick).mockImplementation(async (cb) => ((tick = cb), () => {}));
    vi.mocked(api.updateEntry).mockResolvedValue({} as never);
    vi.mocked(api.addEntry).mockResolvedValue({} as never);
    vi.mocked(api.deleteEntry).mockResolvedValue();
    vi.mocked(api.unmarkLunch).mockResolvedValue();
    vi.mocked(api.exportWeek).mockResolvedValue();
    day();
  });

  it("renders week cards, grid, holiday tag and hint", async () => {
    await mount();
    expect(screen.getByText("Total trabalhado")).toBeTruthy();
    expect(screen.getByText("40h")).toBeTruthy();
    expect(screen.getByText("Portal B2B")).toBeTruthy();
    expect(screen.getByText("feriado")).toBeTruthy();
    expect(screen.getAllByText("+1 extra").length).toBeGreaterThan(0);
    expect(screen.getByText(/Horas em decimal, sem arredondamento/)).toBeTruthy();
  });

  it("shows the empty state", async () => {
    vi.mocked(api.getWeek).mockResolvedValue(week({ rows: [] }));
    await mount();
    expect(screen.getByText("Nada registrado nesta semana.")).toBeTruthy();
  });

  it("copies a cell value and toasts", async () => {
    await mount();
    fireEvent.click(screen.getAllByTitle("Clique pra copiar")[0]);
    await flush();
    expect(writeText).toHaveBeenCalledWith("5,5");
    expect(screen.getByText("5,5 copiado")).toBeTruthy();
  });

  it("clicking a day header opens that day", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Qua/ }));
    await flush();
    expect(api.getDay).toHaveBeenCalledWith("2026-11-11");
    expect(screen.getByText("‹ Semana")).toBeTruthy();
    fireEvent.click(screen.getByText("‹ Semana"));
    await flush();
    expect(screen.getByText("Total trabalhado")).toBeTruthy();
  });

  it("Por cliente refetches with grouping client", async () => {
    await mount();
    fireEvent.click(screen.getByRole("radio", { name: "Por cliente" }));
    await flush();
    expect(api.getWeek).toHaveBeenLastCalledWith(expect.any(String), "client");
  });

  it("navigates weeks and offers Esta semana", async () => {
    await mount();
    expect(screen.queryByText("Esta semana")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    await flush();
    expect(screen.getByText("Esta semana")).toBeTruthy();
  });

  it("refetches on changed and on a 15 s tick", async () => {
    await mount();
    const n = vi.mocked(api.getWeek).mock.calls.length;
    await act(async () => changed());
    expect(vi.mocked(api.getWeek).mock.calls.length).toBe(n + 1);
    await act(async () => tick(Date.now() + 1000));
    expect(vi.mocked(api.getWeek).mock.calls.length).toBe(n + 1);
    await act(async () => tick(Date.now() + 20_000));
    expect(vi.mocked(api.getWeek).mock.calls.length).toBe(n + 2);
  });

  it("exports with a save dialog", async () => {
    vi.mocked(save).mockResolvedValue("/tmp/x/horas_2026-11-09.csv");
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 10, 11, 10) });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Detalhar início e fim de cada registro" }));
    fireEvent.click(screen.getByText("CSV"));
    await flush();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "horas_2026-11-09.csv" }));
    expect(api.exportWeek).toHaveBeenCalledWith("2026-11-09", "project", "csv", true, "/tmp/x/horas_2026-11-09.csv");
  });

  it("does not export when the dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));
    fireEvent.click(screen.getByText("HTML"));
    await flush();
    expect(api.exportWeek).not.toHaveBeenCalled();
  });
});

describe("DayView", () => {
  const seg = (entryId: number, a: string, b: string, running = false) => ({
    entryId,
    projectId: 2,
    start: atLocal("2026-11-11", a),
    end: atLocal("2026-11-11", b),
    running,
  });

  async function openDay(over: Partial<DayCalc> = {}) {
    day(over);
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Qua/ }));
    await flush();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    act(() => useToasts.getState().dismiss());
    vi.mocked(api.getWeek).mockResolvedValue(week());
    vi.mocked(api.getSnapshot).mockResolvedValue({ recents: [{ project: projects[1] }], projects } as never);
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    vi.mocked(api.onChanged).mockImplementation(async (cb) => ((changed = () => cb({} as never)), () => {}));
    vi.mocked(api.onTick).mockImplementation(async (cb) => ((tick = cb), () => {}));
    vi.mocked(api.updateEntry).mockResolvedValue({} as never);
    vi.mocked(api.addEntry).mockResolvedValue({} as never);
    vi.mocked(api.deleteEntry).mockResolvedValue();
    vi.mocked(api.unmarkLunch).mockResolvedValue();
    vi.mocked(api.undo).mockResolvedValue(true);
  });

  it("changing an end time calls updateEntry with only the end", async () => {
    await openDay({ segments: [seg(7, "09:00", "12:00")] });
    fireEvent.click(screen.getByRole("button", { name: "12:00" }));
    fireEvent.click(screen.getByRole("option", { name: "Hora 17" }));
    fireEvent.click(screen.getByRole("option", { name: "Minuto 30" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await flush();
    expect(api.updateEntry).toHaveBeenCalledWith(7, { end: atLocal("2026-11-11", "17:30") });
  });

  it("shows the rejection message in a toast", async () => {
    vi.mocked(api.updateEntry).mockRejectedValue("Esse horário sobrepõe outro registro");
    await openDay({ segments: [seg(7, "09:00", "12:00")] });
    fireEvent.click(screen.getByRole("button", { name: "12:00" }));
    fireEvent.click(screen.getByRole("option", { name: "Hora 17" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await flush();
    expect(screen.getByText("Esse horário sobrepõe outro registro")).toBeTruthy();
  });

  it("marks a running entry with agora and no end picker", async () => {
    await openDay({ segments: [seg(7, "09:00", "10:00", true)] });
    expect(screen.getByText("agora")).toBeTruthy();
  });

  it("deletes an entry with undo", async () => {
    await openDay({ segments: [seg(7, "09:00", "12:00")] });
    fireEvent.click(screen.getByRole("button", { name: "Apagar registro" }));
    await flush();
    expect(api.deleteEntry).toHaveBeenCalledWith(7);
    fireEvent.click(within(screen.getByRole("status")).getByText("Desfazer"));
    expect(api.undo).toHaveBeenCalled();
  });

  it("adds a one hour entry after the last one with the first recent project", async () => {
    await openDay({ segments: [seg(7, "09:00", "12:00")] });
    fireEvent.click(screen.getByText("+ Adicionar registro"));
    await flush();
    expect(api.addEntry).toHaveBeenCalledWith(2, atLocal("2026-11-11", "12:00"), atLocal("2026-11-11", "13:00"));
  });

  it("unmarks a marked lunch", async () => {
    await openDay({
      segments: [seg(7, "09:00", "12:00")],
      lunch: { day: "2026-11-11", start: atLocal("2026-11-11", "12:00"), end: atLocal("2026-11-11", "13:00") },
      lunchStatus: "marked",
    });
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar almoço" }));
    await flush();
    expect(api.unmarkLunch).toHaveBeenCalledWith("2026-11-11");
  });

  it("explains the lunch per status", async () => {
    await openDay({ segments: [seg(7, "09:00", "12:00")], lunchStatus: "auto", autoLunch: { projectId: 2, ms: H } });
    expect(screen.getByText(/foram descontados de/).textContent).toContain("1h");
    expect(screen.getByText(/que estava rodando às 12:00/)).toBeTruthy();
  });

  it("explains a pending lunch", async () => {
    await openDay({ segments: [seg(7, "09:00", "12:00")], lunchStatus: "pending" });
    expect(screen.getByText(/Almoço ainda não marcado/)).toBeTruthy();
  });

  it("shows holiday in the jornada card", async () => {
    await openDay({ isHoliday: true });
    expect(screen.getByText("Jornada (feriado)")).toBeTruthy();
  });
});
