import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { JornadaEditor } from "./JornadaEditor";
import { StepWorkday } from "../onboarding/StepWorkday";

const week = [8, 8, 8, 8, 8, 0, 0];

describe("JornadaEditor", () => {
  it("lays the seven days on a regular grid, each card containing its full-width stepper", () => {
    render(<JornadaEditor value={week} onChange={() => {}} />);
    const grid = screen.getByTestId("jornada-days");
    expect(grid.className).toContain("grid");
    expect(grid.className).toContain("grid-cols-4");
    const cards = within(grid).getAllByTestId("jornada-day");
    expect(cards).toHaveLength(7);
    for (const card of cards) {
      expect(card.className).toContain("min-w-0");
      const stepper = within(card).getByRole("group");
      expect(stepper.className).toContain("w-full");
      expect(within(stepper).getByRole("spinbutton")).toBeTruthy();
      for (const b of within(stepper).getAllByRole("button")) expect(b.className).toContain("w-7");
    }
    expect(cards.map((c) => c.firstElementChild?.textContent)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
  });

  it("each day's value is a focusable spinbutton named after the weekday; arrows step it", () => {
    const onChange = vi.fn();
    render(<JornadaEditor value={week} onChange={onChange} />);
    const mon = screen.getByRole("spinbutton", { name: "Segunda" });
    expect(mon.tabIndex).toBe(0);
    expect(screen.getByRole("spinbutton", { name: "Domingo" })).toBeTruthy();
    fireEvent.keyDown(mon, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith([8.5, 8, 8, 8, 8, 0, 0]);
  });

  it("steps one day by half an hour", () => {
    const onChange = vi.fn();
    render(<JornadaEditor value={week} onChange={onChange} />);
    const sat = screen.getAllByTestId("jornada-day")[5];
    fireEvent.click(within(sat).getByRole("button", { name: "Aumentar" }));
    expect(onChange).toHaveBeenCalledWith([8, 8, 8, 8, 8, 0.5, 0]);
  });

  it("is the same component in onboarding", () => {
    render(<StepWorkday value={week} onChange={() => {}} />);
    expect(screen.getAllByTestId("jornada-day")).toHaveLength(7);
  });
});
