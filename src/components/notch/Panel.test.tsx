import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", async () => (await import("./fixtures")).apiMock());

import * as api from "../../lib/api";
import { useTracker } from "../../stores/tracker";
import { useToasts } from "../../stores/toast";
import { snapshot } from "./fixtures";
import { Panel } from "./Panel";

const props = { onCreate: () => {}, onAll: () => {}, onClose: () => {} };

describe("Panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => useToasts.getState().dismiss());
  });

  it("Space pauses when running", () => {
    useTracker.getState().setSnapshot(snapshot());
    render(<Panel {...props} />);
    fireEvent.keyDown(window, { key: " " });
    expect(api.pauseClock).toHaveBeenCalled();
    expect(api.resumeClock).not.toHaveBeenCalled();
  });

  it("Space resumes when paused", () => {
    useTracker.getState().setSnapshot(snapshot({ status: "paused", runningSince: null }));
    render(<Panel {...props} />);
    expect(screen.getByText("pausado")).toBeTruthy();
    fireEvent.keyDown(window, { key: " " });
    expect(api.resumeClock).toHaveBeenCalled();
    expect(api.pauseClock).not.toHaveBeenCalled();
  });

  it("Space is ignored while typing in the search field", () => {
    useTracker.getState().setSnapshot(snapshot());
    render(<Panel {...props} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Trocar para… ou criar projeto"), { key: " " });
    expect(api.pauseClock).not.toHaveBeenCalled();
  });

  it("a footer window that fails to open toasts the error and keeps the panel", async () => {
    vi.mocked(api.openWindow).mockRejectedValueOnce("janela indisponível");
    useTracker.getState().setSnapshot(snapshot());
    const onClose = vi.fn();
    render(<Panel {...props} onClose={onClose} />);
    await act(async () => fireEvent.click(screen.getByText("Configurações")));
    expect(api.openWindow).toHaveBeenCalledWith("settings");
    expect(onClose).not.toHaveBeenCalled();
    expect(useToasts.getState().current?.message).toBe("janela indisponível");
  });

  it("a footer window that opens closes the panel", async () => {
    useTracker.getState().setSnapshot(snapshot());
    const onClose = vi.fn();
    render(<Panel {...props} onClose={onClose} />);
    await act(async () => fireEvent.click(screen.getByText("Ver horas da semana")));
    expect(api.openWindow).toHaveBeenCalledWith("report");
    expect(onClose).toHaveBeenCalled();
  });

  it("number keys switch to the recent with that shortcut", () => {
    useTracker.getState().setSnapshot(snapshot());
    render(<Panel {...props} />);
    fireEvent.keyDown(window, { key: "2" });
    expect(api.switchProject).toHaveBeenCalledWith(1);
  });

  it("stop offers undo", async () => {
    useTracker.getState().setSnapshot(snapshot());
    render(<Panel {...props} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Parar e encerrar" })));
    expect(api.stopClock).toHaveBeenCalled();
    const t = useToasts.getState().current;
    expect(t?.message).toBe("Relógio parado");
    await act(async () => t?.undo?.());
    expect(api.undo).toHaveBeenCalled();
  });

  it("shows the day progress and jornada", () => {
    useTracker.getState().setSnapshot(snapshot());
    render(<Panel {...props} />);
    expect(screen.getByText("Hoje 3h")).toBeTruthy();
    expect(screen.getByText("jornada 8h")).toBeTruthy();
  });

  it("day without jornada says everything is extra", () => {
    useTracker.getState().setSnapshot(snapshot({ todayJornadaMs: 0 }));
    render(<Panel {...props} />);
    expect(screen.getByText("dia sem jornada, tudo é extra")).toBeTruthy();
  });
});
