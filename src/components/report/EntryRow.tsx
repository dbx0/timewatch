import { addDays, atLocal } from "../../lib/dates";
import { dur, hm } from "../../lib/format";
import { ptBR } from "../../i18n/pt-BR";
import type { IsoDate, Project, Seg } from "../../lib/types";
import { useState } from "react";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";
import { NoteField } from "../ui/NoteField";
import { Popover } from "../ui/Popover";
import { TimePicker } from "../ui/TimePicker";

interface Props {
  day: IsoDate;
  seg: Seg;
  projects: Project[];
  onUpdate: (id: number, patch: { start?: number; end?: number; projectId?: number }) => void;
  onDelete: (id: number) => void;
  onNote: (id: number, note: string | null) => void;
}

const t = ptBR.report;

export function EntryRow({ day, seg, projects, onUpdate, onDelete, onNote }: Props) {
  const [noteAnchor, setNoteAnchor] = useState<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState(false);
  const options: DropdownOption<number>[] = projects
    .filter((p) => !p.archived || p.id === seg.projectId)
    .map((p) => ({ value: p.id, label: p.name, color: p.color, group: p.client }));
  const clippedStart = seg.start === atLocal(day, "00:00");
  const clippedEnd = !seg.running && seg.end === atLocal(addDays(day, 1), "00:00");
  const change = (field: "start" | "end", current: string) => (v: string) => {
    if (v === current) return;
    onUpdate(seg.entryId, { [field]: atLocal(day, v) });
  };
  const proj = projects.find((p) => p.id === seg.projectId);

  const note = seg.note ?? null;
  const saveNote = (next: string | null) => {
    setEditing(false);
    if (next !== note) onNote(seg.entryId, next);
  };

  return (
    <div className="group rounded-[10px] px-1.5 py-2 hover:bg-[#17171d]">
      <div className="flex items-center gap-2.5">
        {clippedStart ? (
          <span className="text-xs text-dim">{t.continuesFromPrev}</span>
        ) : (
          <TimePicker minuteStep={1} value={hm(seg.start)} onChange={change("start", hm(seg.start))} />
        )}
        <span className="text-dim">→</span>
        {clippedEnd ? (
          <span className="text-xs text-dim">{t.continuesNext}</span>
        ) : seg.running ? (
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent2">{t.now}</span>
        ) : (
          <TimePicker minuteStep={1} value={hm(seg.end)} onChange={change("end", hm(seg.end))} />
        )}
        <Dropdown
          className="ml-1.5"
          value={seg.projectId}
          options={options}
          onChange={(id) => onUpdate(seg.entryId, { projectId: id })}
          renderValue={(o) => (
            <>
              {o?.color && <i className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: o.color }} />}
              <span>{o?.label}</span>
              {proj?.client && <span className="text-xs text-dim">{proj.client}</span>}
            </>
          )}
        />
        <span className="ml-auto min-w-[70px] text-right tabular-nums text-mute">{dur(seg.end - seg.start)}</span>
        <button
          ref={setNoteAnchor}
          type="button"
          aria-label={note ? t.editNote : t.addNote}
          title={note ? t.editNote : t.addNote}
          aria-expanded={editing}
          onClick={() => setEditing((o) => !o)}
          className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-mute outline-none transition hover:bg-raise2 hover:text-text focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent2 group-hover:opacity-100 ${
            note || editing ? "opacity-100" : "opacity-0"
          }`}
        >
          <NoteIcon />
        </button>
        <DeleteButton label={t.delete} onClick={() => onDelete(seg.entryId)} />
      </div>
      {note && (
        <div
          title={note}
          onClick={() => setEditing(true)}
          className="ml-[3px] mt-1 cursor-pointer truncate text-[13px] text-mute hover:text-text"
        >
          {note}
        </div>
      )}
      <Popover anchor={noteAnchor} open={editing} onClose={() => setEditing(false)}>
        <NoteField
          className="w-[280px] p-1"
          initial={note ?? ""}
          autoFocus
          cancelLabel={t.cancelNote}
          onCancel={() => setEditing(false)}
          onSave={saveNote}
        />
      </Popover>
    </div>
  );
}

function NoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h5" />
    </svg>
  );
}

export function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-mute opacity-0 outline-none transition hover:bg-raise2 hover:text-text focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent2 group-hover:opacity-100"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </button>
  );
}
