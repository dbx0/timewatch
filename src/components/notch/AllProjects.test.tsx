import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", async () => (await import("./fixtures")).apiMock());

import * as api from "../../lib/api";
import { setLang } from "../../i18n";
import { useTracker } from "../../stores/tracker";
import { projects, snapshot } from "./fixtures";
import { AllProjects } from "./AllProjects";
import { CreateProject } from "./CreateProject";

const solo = [
  { id: 7, name: "Solo A", client: "", color: "#fff", archived: false },
  { id: 8, name: "Solo B", client: "Sem cliente", color: "#fff", archived: false },
  { id: 9, name: "Zeta", client: "Ábaco", color: "#fff", archived: false },
];

describe("AllProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTracker.getState().setSnapshot(snapshot({ projects: [...projects, ...solo] }));
  });
  afterEach(() => act(() => setLang("pt-BR")));

  it("groups by client in the UI language, no client (empty or legacy) as one translated group last", () => {
    render(<AllProjects onBack={() => {}} onCreate={() => {}} />);
    const groups = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["Ábaco", "Acme", "Globex", "Sem cliente"]);
    act(() => setLang("en"));
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toContain("No client");
  });

  it("the list is focusable; arrows and Enter pick a project", async () => {
    const onBack = vi.fn();
    render(<AllProjects onBack={onBack} onCreate={() => {}} />);
    const list = screen.getByRole("listbox");
    expect(list.tabIndex).toBe(0);
    act(() => list.focus());
    fireEvent.keyDown(list, { key: "ArrowDown" });
    const id = list.getAttribute("aria-activedescendant");
    expect(document.getElementById(id!)?.textContent).toContain("Migração SAP");
    expect(document.getElementById(id!)?.getAttribute("data-active")).toBe("true");
    await act(async () => fireEvent.keyDown(list, { key: "Enter" }));
    expect(api.switchProject).toHaveBeenCalledWith(1);
    expect(onBack).toHaveBeenCalled();
  });
});

describe("CreateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTracker.getState().setSnapshot(snapshot({ projects: [...projects, ...solo] }));
    vi.mocked(api.createProject).mockResolvedValue({ id: 10, name: "Novo", client: "", color: "#fff", archived: false });
  });

  it("saves an empty client when none is picked, not the translated label", async () => {
    render(<CreateProject initialName="Novo" onBack={() => {}} onDone={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Criar e iniciar" })));
    expect(api.createProject).toHaveBeenCalledWith("Novo", "", expect.any(String));
  });

  it("offers one Sem cliente chip (empty and legacy merged) that saves an empty client", async () => {
    render(<CreateProject initialName="Novo" onBack={() => {}} onDone={() => {}} />);
    const chips = screen.getAllByRole("button", { name: "Sem cliente" });
    expect(chips).toHaveLength(1);
    fireEvent.click(chips[0]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Criar e iniciar" })));
    expect(api.createProject).toHaveBeenCalledWith("Novo", "", expect.any(String));
  });
});
