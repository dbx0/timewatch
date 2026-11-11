import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const win = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(),
  onResized: vi.fn(),
};
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));

import { TitleBar } from "./TitleBar";

beforeEach(() => {
  Object.values(win).forEach((f) => f.mockReset());
  win.isMaximized.mockResolvedValue(false);
  win.onResized.mockResolvedValue(() => {});
});

describe("TitleBar", () => {
  it("shows title and three buttons when resizable", async () => {
    render(<TitleBar title="Horas" />);
    expect(screen.getByText("Horas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minimizar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maximizar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeTruthy();
    await act(async () => {});
  });

  it("has no maximize when not resizable", async () => {
    render(<TitleBar title="Bem-vindo" resizable={false} />);
    expect(screen.queryByRole("button", { name: "Maximizar" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    await act(async () => {});
  });

  it("buttons call the window API", async () => {
    render(<TitleBar title="Horas" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Minimizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(win.minimize).toHaveBeenCalledTimes(1);
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it("bar and title are drag regions, buttons are not; no extra double-click handler (Tauri handles it)", async () => {
    const { container } = render(<TitleBar title="Horas" />);
    await act(async () => {});
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(screen.getByText("Horas").hasAttribute("data-tauri-drag-region")).toBe(true);
    screen.getAllByRole("button").forEach((b) => expect(b.hasAttribute("data-tauri-drag-region")).toBe(false));
    fireEvent.doubleClick(bar);
    expect(win.toggleMaximize).not.toHaveBeenCalled();
  });

  it("shows Restaurar when maximized and follows resize events", async () => {
    win.isMaximized.mockResolvedValue(true);
    let resized: () => void = () => {};
    win.onResized.mockImplementation(async (cb: () => void) => {
      resized = cb;
      return () => {};
    });
    render(<TitleBar title="Horas" />);
    expect(await screen.findByRole("button", { name: "Restaurar" })).toBeTruthy();
    win.isMaximized.mockResolvedValue(false);
    await act(async () => resized());
    expect(screen.getByRole("button", { name: "Maximizar" })).toBeTruthy();
  });
});
