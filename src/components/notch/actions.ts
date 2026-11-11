import * as api from "../../lib/api";
import type { AbsenceResolution, Project } from "../../lib/types";
import { ptBR } from "../../i18n/pt-BR";
import { useNotePrompt } from "../../stores/notePrompt";
import { toast } from "../../stores/toast";
import { useTracker } from "../../stores/tracker";

const t = ptBR.toast;

/** Runs a backend action; failures surface as a toast with the backend message. */
async function run<T>(f: () => Promise<T>): Promise<T | undefined> {
  try {
    return await f();
  } catch (e) {
    toast(String(e));
    return undefined;
  }
}

export async function undo() {
  const ok = await run(api.undo);
  if (ok !== undefined) toast(ok ? t.undone : t.nothingToUndo);
}

export const undoable = { undo: () => void undo() };

export async function switchTo(p: Project) {
  const s = useTracker.getState().snapshot;
  if (s?.status === "running" && s.sessionProject?.id === p.id) return;
  if (await run(() => api.switchProject(p.id).then(() => true))) toast(t.switched(p.name));
}

/** Pausing from the notch asks for a note about the closed block (switching does not). */
export async function pause() {
  const r = await run(() => api.pauseClock().then((closed) => ({ closed })));
  if (!r) return;
  toast(t.paused);
  useNotePrompt.getState().ask(r.closed);
}

export async function resume() {
  if (await run(() => api.resumeClock().then(() => true))) toast(t.resumed);
}

export async function togglePause() {
  const status = useTracker.getState().snapshot?.status;
  if (status === "running") await pause();
  else if (status === "paused") await resume();
}

export async function stop() {
  const r = await run(() => api.stopClock().then((closed) => ({ closed })));
  if (!r) return;
  toast(t.stopped, undoable);
  useNotePrompt.getState().ask(r.closed);
}

/** Saving a note keeps the stop's undo toast (no toast on success). */
export async function saveNote(id: number, note: string | null) {
  await run(() => api.setEntryNote(id, note));
}

export async function resolve(r: AbsenceResolution, moveName?: string): Promise<boolean> {
  const ok = await run(() => api.resolveAbsence(r).then(() => true));
  if (!ok) return false;
  const msg =
    r.kind === "discount" ? t.discounted
    : r.kind === "lunch" ? t.lunch
    : r.kind === "keep" ? t.kept
    : t.moved(moveName ?? "");
  toast(msg, undoable);
  return true;
}

export async function createAndStart(name: string, client: string, color: string): Promise<boolean> {
  const p = await run(() => api.createProject(name, client, color));
  if (!p) return false;
  await switchTo(p);
  return true;
}
