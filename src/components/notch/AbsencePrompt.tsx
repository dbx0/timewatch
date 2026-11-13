import { useRef, useState } from "react";
import { useT } from "../../i18n";
import { dur, hm } from "../../lib/format";
import type { AbsenceResolution, Project } from "../../lib/types";
import { useTracker } from "../../stores/tracker";
import { Button } from "../ui/Button";
import { resolve } from "./actions";
import { Dot } from "./icons";

/** Replaces the panel while `snapshot.pendingAbsence` exists. */
export function AbsencePrompt({ onResolved }: { onResolved?: () => void }) {
  const s = useT().notch;
  const snapshot = useTracker((st) => st.snapshot);
  // One answer at a time: a double click must not send a second resolve_absence.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const a = snapshot?.pendingAbsence;
  if (!snapshot || !a) return null;
  const find = (id: number) => snapshot.projects.find((p) => p.id === id);
  const absent = find(a.projectId);
  const others: Project[] = [];
  const add = (p: Project | undefined) => {
    if (p && !p.archived && p.id !== a.projectId && !others.some((o) => o.id === p.id)) others.push(p);
  };
  snapshot.recents.forEach((r) => add(r.project));
  snapshot.projects.forEach(add);
  const chips = others.slice(0, 6);

  const answer = async (r: AbsenceResolution, name?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (await resolve(r, name)) onResolved?.();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex min-h-[22px] items-center gap-2 text-[13px] text-mute">
        {a.reason === "idle" ? s.absenceIdle : s.absenceSleep}
      </div>
      <div className="mb-0.5 mt-1.5 text-[19px] font-semibold">{s.absenceTitle(hm(a.start), hm(a.end))}</div>
      <div className="mb-3.5 text-mute">
        {dur(a.end - a.start)} {s.absenceCounted}{" "}
        {absent && <span style={{ color: absent.color }}>{absent.name}</span>}. {s.absenceQuestion}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button disabled={busy} onClick={() => void answer({ kind: "discount" })}>{s.discount}</Button>
        <Button disabled={busy} onClick={() => void answer({ kind: "lunch" })}>{s.lunch}</Button>
        <Button disabled={busy} onClick={() => void answer({ kind: "keep" })}>{s.keep}</Button>
      </div>
      <div className="mb-1.5 ml-0.5 mt-3.5 text-[11px] uppercase tracking-[.06em] text-dim">{s.moveTo}</div>
      <div className="flex flex-wrap gap-1.5">
        {chips.length === 0 && <span className="text-mute">{s.noOther}</span>}
        {chips.map((p) => (
          <button key={p.id} type="button" disabled={busy} onClick={() => void answer({ kind: "moveTo", projectId: p.id }, p.name)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-raise2 px-2.5 py-[3px] text-xs text-text outline-none hover:bg-[#2e2e38] focus-visible:ring-2 focus-visible:ring-accent2 disabled:pointer-events-none disabled:opacity-40">
            <Dot color={p.color} />
            {p.name}
          </button>
        ))}
      </div>
    </>
  );
}
