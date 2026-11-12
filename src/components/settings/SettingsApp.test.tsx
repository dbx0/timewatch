import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", () => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  getSnapshot: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  projectUsage: vi.fn(),
  deleteProject: vi.fn(),
  undo: vi.fn(),
  onChanged: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({ availableMonitors: vi.fn() }));

import { availableMonitors } from "@tauri-apps/api/window";
import * as api from "../../lib/api";
import { setLang } from "../../i18n";
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
  language: "system",
};
const flush = () => act(async () => {});

async function mount() {
  render(<SettingsApp />);
  await flush();
}
const nav = (name: string) => fireEvent.click(screen.getByText(name));

beforeEach(() => {
  vi.resetAllMocks();
  setLang("pt-BR");
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

  it("language dropdown defaults to automatic and saves the choice", async () => {
    await mount();
    expect(screen.getByText("Idioma")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Idioma" }));
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(["Automático (sistema)✓", "Português", "English", "Español"]));
    fireEvent.click(screen.getByText("English"));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, language: "en" });
  });

  it("re-renders in the new language without losing the section", async () => {
    await mount();
    nav("Almoço");
    act(() => setLang("en"));
    expect(screen.getByText("Lunch reference time")).toBeTruthy();
    expect(screen.getByText("General")).toBeTruthy();
    act(() => setLang("pt-BR"));
    expect(screen.getByText("Horário de referência")).toBeTruthy();
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

  describe("delete project", () => {
    const del = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

    it("asks a short question when the project has no entries, then deletes with an undo toast", async () => {
      vi.mocked(api.projectUsage).mockResolvedValue({ entries: 0, ms: 0 });
      vi.mocked(api.deleteProject).mockResolvedValue({ project: projects[0], entries: 0, ms: 0 });
      vi.mocked(api.undo).mockResolvedValue(true);
      await mount();
      nav("Projetos");
      del("Apagar projeto Migração SAP");
      await flush();
      expect(api.projectUsage).toHaveBeenCalledWith(projects[0].id);
      expect(screen.getByText("Apagar o projeto Migração SAP?")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
      await flush();
      expect(api.deleteProject).toHaveBeenCalledWith(projects[0].id);
      const t = useToasts.getState().current;
      expect(t?.message).toBe("Projeto apagado");
      t?.undo?.();
      expect(api.undo).toHaveBeenCalled();
    });

    it("shows hours and entry count when the project has entries, and Cancelar keeps it", async () => {
      vi.mocked(api.projectUsage).mockResolvedValue({ entries: 3, ms: 5_400_000 });
      await mount();
      nav("Projetos");
      del("Apagar projeto Migração SAP");
      await flush();
      expect(
        screen.getByText("Migração SAP tem 1,5h registradas em 3 registros. Apagar o projeto e todos os registros?"),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(api.deleteProject).not.toHaveBeenCalled();
    });

    it("uses Apagar tudo and the current language", async () => {
      vi.mocked(api.projectUsage).mockResolvedValue({ entries: 1, ms: 3_600_000 });
      await mount();
      nav("Projetos");
      act(() => setLang("en"));
      del("Delete project Migração SAP");
      await flush();
      expect(
        screen.getByText("Migração SAP has 1h logged in 1 entry. Delete the project and all its entries?"),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Delete all" })).toBeTruthy();
      act(() => setLang("pt-BR"));
    });

    it("is disabled for the project in the session", async () => {
      await mount();
      nav("Projetos");
      const btn = screen.getByRole("button", { name: "Apagar projeto Portal B2B" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(screen.getByTitle("Pare o relógio antes de apagar este projeto")).toBeTruthy();
      fireEvent.click(btn);
      expect(api.projectUsage).not.toHaveBeenCalled();
      expect((screen.getByRole("button", { name: "Apagar projeto Migração SAP" }) as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
