import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { toast, useToasts } from "../../stores/toast";
import { ToastHost } from "./Toast";

afterEach(() => {
  vi.useRealTimers();
  act(() => useToasts.getState().dismiss());
});

describe("toast", () => {
  it("shows for 2.4s and runs undo", () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    const undo = vi.fn();
    act(() => toast("Registro apagado", { undo }));
    expect(screen.getByText("Registro apagado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(undo).toHaveBeenCalled();
    expect(useToasts.getState().current).toBeNull();
  });
  it("auto dismisses: 2.4s plain, 5s with undo", () => {
    vi.useFakeTimers();
    act(() => toast("a"));
    act(() => void vi.advanceTimersByTime(2399));
    expect(useToasts.getState().current).not.toBeNull();
    act(() => void vi.advanceTimersByTime(2));
    expect(useToasts.getState().current).toBeNull();
    act(() => toast("b", { undo: () => {} }));
    act(() => void vi.advanceTimersByTime(4999));
    expect(useToasts.getState().current).not.toBeNull();
    act(() => void vi.advanceTimersByTime(2));
    expect(useToasts.getState().current).toBeNull();
  });
});
