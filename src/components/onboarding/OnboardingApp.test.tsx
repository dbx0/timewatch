import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", () => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  finishOnboarding: vi.fn(),
  skipOnboarding: vi.fn(),
}));

import * as api from "../../lib/api";
import type { Settings } from "../../lib/types";
import { OnboardingApp } from "./OnboardingApp";

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
  onboarded: false,
  language: "system",
  weekStart: "monday",
};
const flush = () => act(async () => {});
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const enter = (label: string) => fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });

async function mount() {
  render(<OnboardingApp />);
  await flush();
}
async function toProjects() {
  await mount();
  click("Configurar (1 min)");
}
function addProject(client: string, name: string) {
  type("Cliente", client);
  type("Projeto", name);
  enter("Projeto");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getSettings).mockResolvedValue({ ...base });
  vi.mocked(api.setSettings).mockResolvedValue(undefined);
  vi.mocked(api.finishOnboarding).mockResolvedValue(undefined);
  vi.mocked(api.skipOnboarding).mockResolvedValue(undefined);
});

describe("OnboardingApp", () => {
  it("first step has a language picker showing the current language", async () => {
    await mount();
    const picker = screen.getByRole("button", { name: "Idioma" });
    expect(picker.textContent).toContain("Português");
    fireEvent.click(picker);
    fireEvent.click(screen.getByText("Español"));
    expect(api.setSettings).toHaveBeenCalledWith({ ...base, language: "es" });
    click("Configurar (1 min)");
    expect(screen.queryByRole("button", { name: "Idioma" })).toBeNull();
  });

  it("Pular only skips, creating nothing", async () => {
    await mount();
    click("Pular");
    expect(api.skipOnboarding).toHaveBeenCalledTimes(1);
    expect(api.finishOnboarding).not.toHaveBeenCalled();
  });

  it("cannot continue from Projects with zero projects", async () => {
    await toProjects();
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
    addProject("Acme", "Migração SAP");
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Enter adds the project and keeps the client text", async () => {
    await toProjects();
    addProject("Acme", "Migração SAP");
    expect(screen.getByText("Migração SAP")).toBeTruthy();
    expect((screen.getByLabelText("Cliente") as HTMLInputElement).value).toBe("Acme");
    expect((screen.getByLabelText("Projeto") as HTMLInputElement).value).toBe("");
    // client chip fills the field again
    type("Cliente", "");
    fireEvent.click(screen.getByRole("button", { name: "Acme" }));
    expect((screen.getByLabelText("Cliente") as HTMLInputElement).value).toBe("Acme");
  });

  it("rounding example follows the selection", async () => {
    await toProjects();
    addProject("Acme", "Migração SAP");
    for (let i = 0; i < 3; i++) click("Continuar");
    expect(screen.getByTestId("rounding-example").textContent).toBe("2,17");
    fireEvent.click(screen.getByRole("radio", { name: "15 min" }));
    expect(screen.getByTestId("rounding-example").textContent).toBe("2,25");
    expect(api.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ roundingMin: 15, onboarded: false }));
    fireEvent.click(screen.getByRole("radio", { name: "30 min" }));
    expect(screen.getByTestId("rounding-example").textContent).toBe("2");
  });

  it("a failed save toasts and shows the stored value again", async () => {
    await toProjects();
    addProject("Acme", "Migração SAP");
    click("Continuar");
    click("Continuar");
    vi.mocked(api.setSettings).mockRejectedValueOnce("disco cheio");
    vi.mocked(api.getSettings).mockResolvedValue({ ...base, lunchMin: 60 });
    fireEvent.click(screen.getByRole("radio", { name: "30 min" }));
    expect(screen.getByRole("radio", { name: "30 min" }).getAttribute("aria-checked")).toBe("true");
    await flush();
    expect(screen.getByText("Não foi possível salvar. Tente de novo.")).toBeTruthy();
    expect(api.getSettings).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("radio", { name: "1h" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "30 min" }).getAttribute("aria-checked")).toBe("false");
  });

  it("lunch step saves immediately", async () => {
    await toProjects();
    addProject("Acme", "Migração SAP");
    click("Continuar");
    click("Continuar");
    fireEvent.click(screen.getByRole("radio", { name: "30 min" }));
    expect(api.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ lunchMin: 30 }));
  });

  it("finishing with project 0 calls finishOnboarding", async () => {
    await toProjects();
    addProject("Acme", "Migração SAP");
    addProject("Acme", "Portal");
    for (let i = 0; i < 4; i++) click("Continuar");
    click(/Começar em Migração SAP/);
    expect(api.finishOnboarding).toHaveBeenCalledWith(
      [{ client: "Acme", name: "Migração SAP" }, { client: "Acme", name: "Portal" }],
      0,
    );
  });

  it("explore-only finishes with no start project", async () => {
    await toProjects();
    addProject("", "Solo");
    for (let i = 0; i < 4; i++) click("Continuar");
    click("Nenhum agora, só quero explorar");
    expect(api.finishOnboarding).toHaveBeenCalledWith([{ client: "", name: "Solo" }], null);
  });

  it("a project without client is saved with an empty client and shown as Sem cliente", async () => {
    await toProjects();
    addProject("", "Solo");
    expect(screen.getByText("Sem cliente")).toBeTruthy();
    // No chip for the empty client.
    expect(screen.queryByRole("button", { name: "Sem cliente" })).toBeNull();
    for (let i = 0; i < 4; i++) click("Continuar");
    expect(screen.getByText("Sem cliente")).toBeTruthy();
  });
});
