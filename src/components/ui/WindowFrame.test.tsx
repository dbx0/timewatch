import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}));

import { WindowFrame } from "./WindowFrame";

describe("WindowFrame", () => {
  it("renders the title bar above the content", async () => {
    render(
      <WindowFrame title="Configurações">
        <p>conteúdo</p>
      </WindowFrame>,
    );
    expect(screen.getByText("Configurações")).toBeTruthy();
    expect(screen.getByText("conteúdo")).toBeTruthy();
    await act(async () => {});
  });
});
