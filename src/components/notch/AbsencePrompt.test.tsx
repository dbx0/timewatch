import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", async () => (await import("./fixtures")).apiMock());

import * as api from "../../lib/api";
import { useTracker } from "../../stores/tracker";
import { useToasts } from "../../stores/toast";
import { snapshot } from "./fixtures";
import { AbsencePrompt } from "./AbsencePrompt";

const at = (h: number, m: number) => new Date(2026, 10, 11, h, m).getTime();

describe("AbsencePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTracker.getState().setSnapshot(
      snapshot({ pendingAbsence: { start: at(12, 5), end: at(13, 10), reason: "idle", projectId: 2 } }),
    );
  });

  it("asks with the absence interval", () => {
    render(<AbsencePrompt onResolved={() => {}} />);
    expect(screen.getByText("Você ficou fora das 12:05 às 13:10")).toBeTruthy();
  });

  it("'Foi o almoço' resolves as lunch with undo", async () => {
    const onResolved = vi.fn();
    render(<AbsencePrompt onResolved={onResolved} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Foi o almoço" })));
    expect(api.resolveAbsence).toHaveBeenCalledWith({ kind: "lunch" });
    expect(useToasts.getState().current?.undo).toBeTypeOf("function");
    expect(onResolved).toHaveBeenCalled();
  });

  it("Descontar and Manter", async () => {
    render(<AbsencePrompt onResolved={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Descontar" })));
    expect(api.resolveAbsence).toHaveBeenCalledWith({ kind: "discount" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Manter" })));
    expect(api.resolveAbsence).toHaveBeenCalledWith({ kind: "keep" });
  });

  it("a double click sends one resolve_absence and disables the answers meanwhile", async () => {
    let done!: () => void;
    vi.mocked(api.resolveAbsence).mockImplementation(() => new Promise<void>((r) => (done = r)));
    const onResolved = vi.fn();
    render(<AbsencePrompt onResolved={onResolved} />);
    const btn = screen.getByRole("button", { name: "Manter" });
    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    fireEvent.click(screen.getByRole("button", { name: "Descontar" }));
    fireEvent.click(screen.getByRole("button", { name: "App Mobile" }));
    expect(api.resolveAbsence).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Descontar" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => done());
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Descontar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("answers again after a failed resolve", async () => {
    vi.mocked(api.resolveAbsence).mockRejectedValueOnce("falhou");
    render(<AbsencePrompt onResolved={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Manter" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Manter" })));
    expect(api.resolveAbsence).toHaveBeenCalledTimes(2);
  });

  it("chips move the time to another project, excluding the absent one", async () => {
    render(<AbsencePrompt onResolved={() => {}} />);
    expect(screen.queryByRole("button", { name: "Portal B2B" })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "App Mobile" })));
    expect(api.resolveAbsence).toHaveBeenCalledWith({ kind: "moveTo", projectId: 3 });
  });
});
