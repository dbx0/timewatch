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
  listMonitors: vi.fn(),
  getShortcutFailure: vi.fn(),
  onShortcutFailed: vi.fn(),
}));

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
  weekStart: "monday",
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
  vi.mocked(api.listMonitors).mockResolvedValue([]);
  vi.mocked(api.getShortcutFailure).mockResolvedValue(null);
  vi.mocked(api.onShortcutFailed).mockResolvedValue(() => {});
});

describe("SettingsApp", () => {
  it("preset Seg-Sex 6h saves jornadaH", async () => {
    await mount();
    nav("Jornada e extras");
    fireEvent.click(screen.getByRole("button", { name: "Seg–Sex 6h" }));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, jornadaH: [6, 6, 6, 6, 6, 0, 0] });
  });

  it("week start segmented saves saturday and reorders the workday days", async () => {
    await mount();
    nav("Jornada e extras");
    fireEvent.click(screen.getByText("Sábado"));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, weekStart: "saturday" });
    const days = screen.getAllByTestId("jornada-day").map((d) => d.firstElementChild?.textContent);
    expect(days).toEqual(["Sáb", "Dom", "Seg", "Ter", "Qua", "Qui", "Sex"]);
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

  it("a failed load toasts instead of leaving the window silently empty", async () => {
    vi.mocked(api.getSettings).mockRejectedValue("Erro ao acessar os dados");
    await mount();
    expect(useToasts.getState().current?.message).toBe("Erro ao acessar os dados");
  });

  it("monitor dropdown shows labels and stores the monitor id", async () => {
    vi.mocked(api.listMonitors).mockResolvedValue([
      { id: "DELL@0,0", label: "DELL (1)", primary: true },
      { id: "DELL@1920,0", label: "DELL (2)", primary: false },
    ]);
    await mount();
    fireEvent.click(screen.getByText("Tela principal"));
    fireEvent.click(screen.getByText("DELL (2)"));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, overlayMonitor: "DELL@1920,0" });
  });

  it("an unplugged stored monitor stays selectable", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...base, overlayMonitor: "LG" });
    await mount();
    expect(screen.getByRole("button", { name: "Monitor da pílula" }).textContent).toContain("LG");
  });

  it("warns when the shortcut could not be registered, and clears after a working change", async () => {
    vi.mocked(api.getShortcutFailure).mockResolvedValue({ shortcut: "Alt+Space", error: "em uso" });
    await mount();
    expect(screen.getByRole("note").textContent).toContain("em uso");
    vi.mocked(api.getShortcutFailure).mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: /Atalho global/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: /Atalho global/ }), { code: "KeyK", key: "k", metaKey: true, shiftKey: true });
    await flush();
    expect(screen.queryByRole("note")).toBeNull();
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

  it("adds a project without client as an empty client", async () => {
    vi.mocked(api.createProject).mockResolvedValue({ ...projects[0], id: 9 });
    await mount();
    nav("Projetos");
    const name = screen.getByPlaceholderText("Projeto");
    fireEvent.change(name, { target: { value: "Solo" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(api.createProject).toHaveBeenCalledWith("Solo", "", expect.stringMatching(/^#/));
  });

  it("groups empty and legacy no-client projects under one translated header, last", async () => {
    vi.mocked(api.getSnapshot).mockResolvedValue(
      snapshot({
        projects: [
          ...projects,
          { id: 7, name: "Solo A", client: "", color: "#fff", archived: false },
          { id: 8, name: "Solo B", client: "Sem cliente", color: "#fff", archived: false },
          { id: 9, name: "Solo C", client: "No client", color: "#fff", archived: false },
        ],
      }),
    );
    await mount();
    nav("Projetos");
    act(() => setLang("en"));
    const headers = [...document.querySelectorAll("main .uppercase")].map((e) => e.textContent);
    expect(headers).toEqual(["Acme", "Globex", "No client"]);
    act(() => setLang("pt-BR"));
    expect(screen.getAllByText("Sem cliente")).toHaveLength(1);
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

    it("undoing a delete with nothing to undo says so", async () => {
      vi.mocked(api.projectUsage).mockResolvedValue({ entries: 0, ms: 0 });
      vi.mocked(api.deleteProject).mockResolvedValue({ project: projects[0], entries: 0, ms: 0 });
      vi.mocked(api.undo).mockResolvedValue(false);
      await mount();
      nav("Projetos");
      del("Apagar projeto Migração SAP");
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
      await flush();
      await act(async () => useToasts.getState().current?.undo?.());
      expect(useToasts.getState().current?.message).toBe("Nada para desfazer");
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
