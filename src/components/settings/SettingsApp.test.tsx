import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", () => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  getSnapshot: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  onChanged: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({ availableMonitors: vi.fn() }));

import { availableMonitors } from "@tauri-apps/api/window";
import * as api from "../../lib/api";
import { useToasts } from "../../stores/toast";
import { projects, snapshot } from "../notch/fixtures";
import { SettingsApp } from "./SettingsApp";
import { formatShortcut, shortcutFromEvent } from "./shortcut";
import type { Settings } from "../../lib/types";

const base: Settings = {
  roundingMin: 0,
  jornadaH: [8, 8, 8, 8, 8, 0, 0],
  holidays: [],
  lunchMin: 60,
  lunchRef: "12:00:00",
  idleMin: 15,
  stopOnSleep: false,
  autostart: true,
  shortcut: "Alt+Space",
  overlayMonitor: null,
  onboarded: true,
};
const flush = () => act(async () => {});

async function mount() {
  render(<SettingsApp />);
  await flush();
}
const nav = (name: string) => fireEvent.click(screen.getByText(name));

beforeEach(() => {
  vi.resetAllMocks();
  useToasts.getState().dismiss();
  vi.mocked(api.getSettings).mockResolvedValue({ ...base });
  vi.mocked(api.setSettings).mockResolvedValue(undefined);
  vi.mocked(api.getSnapshot).mockResolvedValue(snapshot());
  vi.mocked(api.onChanged).mockResolvedValue(() => {});
  vi.mocked(api.updateProject).mockResolvedValue(undefined);
  vi.mocked(availableMonitors).mockResolvedValue([]);
});

describe("SettingsApp", () => {
  it("preset Seg-Sex 6h saves jornadaH", async () => {
    await mount();
    nav("Jornada e extras");
    fireEvent.click(screen.getByRole("button", { name: "Seg–Sex 6h" }));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, jornadaH: [6, 6, 6, 6, 6, 0, 0] });
  });

  it("lunch stepper + saves 75", async () => {
    await mount();
    nav("Almoço");
    fireEvent.click(screen.getByLabelText("Aumentar"));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, lunchMin: 75 });
  });

  it("lunch reference is sent as HH:MM:SS", async () => {
    await mount();
    nav("Almoço");
    fireEvent.click(screen.getByText("12:00"));
    fireEvent.click(screen.getByLabelText("Hora 13"));
    fireEvent.click(screen.getByLabelText("Minuto 00"));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, lunchRef: "13:00:00" });
  });

  it("rounding segmented saves", async () => {
    await mount();
    fireEvent.click(screen.getByText("15 min"));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, roundingMin: 15 });
  });

  it("autostart toggle saves", async () => {
    await mount();
    fireEvent.click(screen.getByRole("switch", { name: "Iniciar junto com o sistema" }));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, autostart: false });
  });

  it("absence section: idle stepper and sleep toggle with note", async () => {
    await mount();
    nav("Ausência");
    expect(screen.getByText(/Com monitor externo o Mac pode não entrar em repouso/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Aumentar"));
    expect(api.setSettings).toHaveBeenLastCalledWith({ ...base, idleMin: 20 });
    fireEvent.click(screen.getByRole("switch", { name: "Parar o relógio ao fechar o notebook" }));
    expect(api.setSettings).toHaveBeenLastCalledWith({ ...base, idleMin: 20, stopOnSleep: true });
  });

  it("holiday chip removal saves", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...base, holidays: ["2026-11-20"] });
    await mount();
    nav("Jornada e extras");
    fireEvent.click(screen.getByRole("button", { name: "Remover feriado 20 nov" }));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, holidays: [] });
  });

  it("error toasts and re-fetches the stored value", async () => {
    await mount();
    vi.mocked(api.setSettings).mockRejectedValueOnce("Atalho já em uso");
    vi.mocked(api.getSettings).mockResolvedValue({ ...base, roundingMin: 0 });
    fireEvent.click(screen.getByText("15 min"));
    await flush();
    expect(useToasts.getState().current?.message).toBe("Atalho já em uso");
    expect(api.getSettings).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Exato").getAttribute("aria-checked")).toBe("true");
  });

  it("monitor dropdown stores the monitor name", async () => {
    vi.mocked(availableMonitors).mockResolvedValue([{ name: "DELL U2720Q" }] as never);
    await mount();
    fireEvent.click(screen.getByText("Tela principal"));
    fireEvent.click(screen.getByText("DELL U2720Q"));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, overlayMonitor: "DELL U2720Q" });
  });

  it("shortcut recorder captures a combo with a modifier and Esc cancels", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    await mount();
    const rec = screen.getByRole("button", { name: /Atalho global/ });
    expect(rec.textContent).toContain("⌥ Space");
    fireEvent.click(rec);
    fireEvent.keyDown(rec, { key: "k", code: "KeyK" });
    expect(api.setSettings).not.toHaveBeenCalled();
    fireEvent.keyDown(rec, { key: "Escape", code: "Escape" });
    expect(api.setSettings).not.toHaveBeenCalled();
    fireEvent.click(rec);
    fireEvent.keyDown(rec, { key: "k", code: "KeyK", metaKey: true, shiftKey: true });
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, shortcut: "CommandOrControl+Shift+K" });
  });

  it("shortcut formatting", () => {
    expect(shortcutFromEvent({ code: "Space", altKey: true } as KeyboardEvent, true)).toBe("Alt+Space");
    expect(shortcutFromEvent({ code: "Space" } as KeyboardEvent, true)).toBeNull();
    expect(shortcutFromEvent({ code: "AltLeft", altKey: true } as KeyboardEvent, true)).toBeNull();
    expect(formatShortcut("CommandOrControl+Shift+K", true)).toBe("⇧ ⌘ K");
    expect(formatShortcut("Alt+Space", false)).toBe("Alt+Space");
  });

  it("archiving a project calls updateProject", async () => {
    await mount();
    nav("Projetos");
    fireEvent.click(screen.getByRole("switch", { name: "Ativo: Migração SAP" }));
    expect(api.updateProject).toHaveBeenCalledWith({ ...projects[0], archived: true });
  });

  it("adds a project with Enter", async () => {
    vi.mocked(api.createProject).mockResolvedValue({ ...projects[0], id: 9 });
    await mount();
    nav("Projetos");
    fireEvent.change(screen.getByPlaceholderText("Cliente"), { target: { value: "Acme" } });
    const name = screen.getByPlaceholderText("Projeto");
    fireEvent.change(name, { target: { value: "Novo" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(api.createProject).toHaveBeenCalledWith("Novo", "Acme", expect.stringMatching(/^#/));
  });

  it("renames a project inline", async () => {
    await mount();
    nav("Projetos");
    fireEvent.click(screen.getByText("Portal B2B"));
    const input = screen.getByDisplayValue("Portal B2B");
    fireEvent.change(input, { target: { value: "Portal B2C" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.updateProject).toHaveBeenCalledWith({ ...projects[1], name: "Portal B2C" });
  });
});
