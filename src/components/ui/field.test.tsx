import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../lib/api", () => ({ createProject: vi.fn(), updateProject: vi.fn() }));

import { StepProjects } from "../onboarding/StepProjects";
import { ProjectsSection } from "../settings/ProjectsSection";
import { textField } from "./field";

/** A ring drawn outside the box is clipped by scrolling containers (onboarding bug): keep it inset. */
describe("text field focus ring", () => {
  it("is inset", () => {
    expect(textField).toContain("focus:ring-inset");
  });

  it("is used by onboarding and settings project inputs", () => {
    render(<StepProjects projects={[]} onChange={() => {}} />);
    render(<ProjectsSection projects={[]} reload={() => {}} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(4);
    for (const i of inputs) expect(i.className).toContain("focus:ring-inset");
  });
});
