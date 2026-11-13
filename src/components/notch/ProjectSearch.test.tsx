import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", async () => (await import("./fixtures")).apiMock());

import * as api from "../../lib/api";
import { useTracker } from "../../stores/tracker";
import { snapshot } from "./fixtures";
import { ProjectSearch } from "./ProjectSearch";

describe("ProjectSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTracker.getState().setSnapshot(snapshot());
  });

  it("filters by name and client, case-insensitive, and offers a create row", () => {
    const onCreate = vi.fn();
    render(<ProjectSearch query="sap" onQueryChange={() => {}} onCreate={onCreate} onAll={() => {}} />);
    expect(screen.getByText("Migração SAP")).toBeTruthy();
    expect(screen.queryByText("Portal B2B")).toBeNull();
    const create = screen.getByText("＋ Criar projeto “sap”");
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith("sap");
  });

  it("matches the client name and skips archived projects", () => {
    render(<ProjectSearch query="GLOBEX" onQueryChange={() => {}} onCreate={() => {}} onAll={() => {}} />);
    expect(screen.getByText("App Mobile")).toBeTruthy();
    expect(screen.queryByText("Legado")).toBeNull();
  });

  it("Enter switches to the first match", () => {
    render(<ProjectSearch query="sap" onQueryChange={() => {}} onCreate={() => {}} onAll={() => {}} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Trocar para… ou criar projeto"), { key: "Enter" });
    expect(api.switchProject).toHaveBeenCalledWith(1);
  });

  it("Enter with no match opens create", () => {
    const onCreate = vi.fn();
    render(<ProjectSearch query="zzz" onQueryChange={() => {}} onCreate={onCreate} onAll={() => {}} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Trocar para… ou criar projeto"), { key: "Enter" });
    expect(api.switchProject).not.toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledWith("zzz");
  });

  it("without a query lists recents with 1–4 badges and today time", () => {
    render(<ProjectSearch query="" onQueryChange={() => {}} onCreate={() => {}} onAll={() => {}} />);
    const rows = screen.getAllByRole("option");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Portal B2B"),
      expect.stringContaining("Migração SAP"),
      expect.stringContaining("App Mobile"),
    ]);
    expect(rows[0].textContent).toContain("2h");
    expect(rows[0].textContent).toContain("1");
    expect(screen.queryByText("Todos os projetos")).toBeNull();
  });

  it("arrows move through the options with aria-activedescendant; Enter picks the active one", () => {
    render(<ProjectSearch query="" onQueryChange={() => {}} onCreate={() => {}} onAll={() => {}} />);
    const input = screen.getByRole("combobox", { name: "Trocar para… ou criar projeto" });
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const id = input.getAttribute("aria-activedescendant");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toContain("Migração SAP");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.getElementById(input.getAttribute("aria-activedescendant")!)?.textContent).toContain("App Mobile");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.switchProject).toHaveBeenCalledWith(1);
  });

  it("with no options, arrows do nothing and Enter keeps the default (create)", () => {
    const onCreate = vi.fn();
    render(<ProjectSearch query="zzz" onQueryChange={() => {}} onCreate={onCreate} onAll={() => {}} />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).toHaveBeenCalledWith("zzz");
  });

  it("with a query, arrows walk the matches", () => {
    render(<ProjectSearch query="a" onQueryChange={() => {}} onCreate={() => {}} onAll={() => {}} />);
    const input = screen.getByRole("combobox");
    for (let i = 0; i < 3; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.switchProject).toHaveBeenCalledWith(3);
  });
});
