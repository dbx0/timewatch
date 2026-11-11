import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  const open = (value = "09:30", props: Partial<React.ComponentProps<typeof TimePicker>> = {}) => {
    const onChange = vi.fn();
    render(<TimePicker value={value} onChange={onChange} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: value }));
    return onChange;
  };

  it("has no OK button: the hour only marks, the minute confirms and closes", () => {
    const onChange = open();
    expect(screen.queryByRole("button", { name: "OK" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Hora 10" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Hora 10" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: "Minuto 05" }));
    expect(onChange).toHaveBeenCalledWith("10:05");
    expect(screen.getByRole("button", { name: /\d\d:\d\d/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("lists minutes in steps of 5 by default and of 1 with minuteStep=1", () => {
    open();
    expect(screen.getAllByRole("option", { name: /^Minuto/ })).toHaveLength(12);
    expect(screen.queryByRole("option", { name: "Minuto 03" })).toBeNull();
    cleanup();
    open("09:30", { minuteStep: 1 });
    expect(screen.getAllByRole("option", { name: /^Minuto/ })).toHaveLength(60);
  });

  it("keeps an off-step current minute selectable", () => {
    open("09:32");
    expect(screen.getByRole("option", { name: "Minuto 32" }).getAttribute("aria-selected")).toBe("true");
  });

  it("navigates with arrows and confirms with Enter", () => {
    const onChange = open("09:30");
    const panel = screen.getByTestId("timepicker-panel");
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    fireEvent.keyDown(panel, { key: "ArrowRight" });
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(panel, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("10:35");
    expect(screen.getByRole("button", { name: /\d\d:\d\d/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("Esc cancels without changing", () => {
    const onChange = open("09:30");
    fireEvent.click(screen.getByRole("option", { name: "Hora 15" }));
    fireEvent.keyDown(screen.getByTestId("timepicker-panel"), { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /\d\d:\d\d/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("is compact: 28px items, 13px text, no saturated selected block", () => {
    open("09:30");
    const on = screen.getByRole("option", { name: "Hora 09" });
    expect(on.className).toContain("h-7");
    expect(on.className).toContain("text-[13px]");
    expect(on.className).not.toContain("bg-accent ");
    expect(on.className).not.toMatch(/bg-accent(\s|$)/);
  });

  it("opening the picker discards half-typed digits", () => {
    const onChange = vi.fn();
    render(<TimePicker value="09:30" onChange={onChange} />);
    const btn = screen.getByRole("button", { name: "09:30" });
    fireEvent.keyDown(btn, { key: "1" });
    expect(btn.textContent).toBe("1");
    fireEvent.click(btn);
    expect(btn.textContent).toBe("09:30");
    fireEvent.keyDown(screen.getByTestId("timepicker-panel"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("09:30");
  });

  it("accepts typed digits on the focused trigger", () => {
    const onChange = vi.fn();
    render(<TimePicker value="09:30" onChange={onChange} />);
    const btn = screen.getByRole("button", { name: "09:30" });
    for (const k of "1330") fireEvent.keyDown(btn, { key: k });
    expect(onChange).toHaveBeenCalledWith("13:30");
    onChange.mockClear();
    for (const k of "745") fireEvent.keyDown(btn, { key: k });
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("07:45");
    onChange.mockClear();
    for (const k of "2599") fireEvent.keyDown(btn, { key: k });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Stepper compact", () => {
  it("fills its container with 28px buttons", () => {
    render(<Stepper compact value={8} step={0.5} min={0} max={24} onChange={() => {}} />);
    expect(screen.getByRole("group").className).toContain("w-full");
    expect(screen.getByRole("button", { name: "Aumentar" }).className).toContain("w-7");
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
