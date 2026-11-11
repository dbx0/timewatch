import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Stepper } from "./Stepper";
import { Segmented } from "./Segmented";
import { Toggle } from "./Toggle";
import { TimePicker } from "./TimePicker";
import { Dropdown } from "./Dropdown";
import { Calendar } from "./Calendar";

describe("Stepper", () => {
  it("clamps to min and max", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stepper value={3} step={5} min={0} max={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Diminuir" }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    rerender(<Stepper value={8} step={5} min={0} max={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    expect(onChange).toHaveBeenLastCalledWith(10);
  });
});

describe("Segmented", () => {
  it("is a radiogroup and reports the clicked value", () => {
    const onChange = vi.fn();
    render(
      <Segmented value={0} options={[{ value: 0, label: "Exato" }, { value: 15, label: "15 min" }]} onChange={onChange} />,
    );
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Exato" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "15 min" }));
    expect(onChange).toHaveBeenCalledWith(15);
  });
});

describe("Toggle", () => {
  it("is a switch and toggles on Space", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Iniciar com o sistema" />);
    const sw = screen.getByRole("switch", { name: "Iniciar com o sistema" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.keyDown(sw, { key: " " });
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("TimePicker", () => {
  it("emits the chosen time on OK", () => {
    const onChange = vi.fn();
    render(<TimePicker value="09:30" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "09:30" }));
    fireEvent.click(screen.getByRole("option", { name: "Hora 10" }));
    fireEvent.click(screen.getByRole("option", { name: "Minuto 05" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onChange).toHaveBeenCalledWith("10:05");
  });
});

describe("Dropdown", () => {
  it("opens on click and selects with Enter", () => {
    const onChange = vi.fn();
    render(
      <Dropdown
        value="a"
        options={[{ value: "a", label: "Alfa" }, { value: "b", label: "Beta" }]}
        onChange={onChange}
      />,
    );
    const btn = screen.getByRole("button", { name: /Alfa/ });
    expect(btn.getAttribute("aria-haspopup")).toBe("listbox");
    fireEvent.click(btn);
    const list = screen.getByRole("listbox");
    expect(screen.getByRole("option", { name: /Alfa/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("Calendar", () => {
  it("toggles a day", () => {
    const onToggle = vi.fn();
    render(<Calendar month="2026-11" selected={["2026-11-03"]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "20 nov" }));
    expect(onToggle).toHaveBeenCalledWith("2026-11-20");
    expect(screen.getByRole("button", { name: "3 nov" }).getAttribute("aria-pressed")).toBe("true");
  });
});
