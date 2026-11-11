import type { Ref } from "react";
import { ptBR } from "../../i18n/pt-BR";
import { dur } from "../../lib/format";
import type { Project } from "../../lib/types";
import { liveDelta, useTracker } from "../../stores/tracker";
import { switchTo } from "./actions";
import { Dot, SearchIcon } from "./icons";
import { focusWithKeyboard } from "./keyboard";

const s = ptBR.notch;

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onCreate: (name: string) => void;
  onAll: () => void;
  onSwitched?: () => void;
  inputRef?: Ref<HTMLInputElement>;
}

export function matchProjects(projects: Project[], query: string): Project[] {
  const q = query.trim().toLowerCase();
  return projects.filter((p) => !p.archived && `${p.name} ${p.client}`.toLowerCase().includes(q));
}

/** Today's time per project id (recents only), with the running project kept live. */
export function useTodayById(): (id: number) => number {
  const snapshot = useTracker((st) => st.snapshot);
  const delta = useTracker(liveDelta);
  return (id) => {
    const r = snapshot?.recents.find((x) => x.project.id === id);
    if (!r) return 0;
    return r.todayMs + (snapshot?.sessionProject?.id === id ? delta : 0);
  };
}

export function ProjectRow({ p, today, badge, current, onPick }: {
  p: Project;
  today: number;
  badge?: number | null;
  current: boolean;
  onPick: (p: Project) => void;
}) {
  return (
    <div
      role="option"
      aria-selected={current}
      onClick={() => onPick(p)}
      className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 ${current ? "bg-[#17213a]" : "hover:bg-raise"}`}
    >
      <Dot color={p.color} />
      <span className="min-w-0 truncate">{p.name}</span>
      <span className="truncate text-xs text-dim">{p.client}</span>
      <span className="ml-auto flex flex-none items-center gap-2 text-xs text-mute">
        {today > 0 ? dur(today) : ""}
        {badge ? <span className="rounded-[5px] bg-raise2 px-1.5 py-px font-mono text-[11px] text-mute">{badge}</span> : null}
      </span>
    </div>
  );
}

const subRow = "flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-mute outline-none hover:bg-raise focus-visible:ring-2 focus-visible:ring-accent2";

export function ProjectSearch({ query, onQueryChange, onCreate, onAll, onSwitched, inputRef }: Props) {
  const snapshot = useTracker((st) => st.snapshot);
  const todayOf = useTodayById();
  if (!snapshot) return null;
  const current = snapshot.sessionProject?.id ?? null;
  const active = snapshot.projects.filter((p) => !p.archived);
  const raw = query.trim();
  const matches = raw ? matchProjects(snapshot.projects, raw) : [];

  const pick = (p: Project) => {
    void switchTo(p);
    onSwitched?.();
  };

  return (
    <>
      <div className="flex items-center gap-2 rounded-[10px] bg-raise px-2.5">
        <SearchIcon />
        <input
          ref={inputRef}
          value={query}
          placeholder={s.search}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onQueryChange(e.target.value)}
          onMouseDown={(e) => {
            if (document.activeElement !== e.currentTarget) {
              e.preventDefault();
              void focusWithKeyboard(e.currentTarget);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !raw) return;
            e.preventDefault();
            if (matches.length) pick(matches[0]);
            else onCreate(raw);
          }}
          className="flex-1 border-0 bg-transparent py-[9px] text-text outline-none placeholder:text-dim"
        />
      </div>
      <div role="listbox" className="mt-1.5 max-h-[260px] overflow-auto">
        {!raw ? (
          <>
            {snapshot.recents.length === 0 && <div className="px-2.5 py-3.5 text-[13px] text-mute">{s.empty}</div>}
            {snapshot.recents.map((r) => (
              <ProjectRow
                key={r.project.id}
                p={r.project}
                today={todayOf(r.project.id)}
                badge={r.shortcut}
                current={r.project.id === current}
                onPick={pick}
              />
            ))}
            {active.length > snapshot.recents.length && (
              <button type="button" className={subRow} onClick={onAll}>
                {s.allProjects}
                <span className="ml-auto text-xs">{active.length}</span>
              </button>
            )}
          </>
        ) : (
          <>
            {matches.map((p) => (
              <ProjectRow key={p.id} p={p} today={todayOf(p.id)} current={p.id === current} onPick={pick} />
            ))}
            <button type="button" className={subRow} onClick={() => onCreate(raw)}>
              {s.createRow(raw)}
            </button>
          </>
        )}
      </div>
    </>
  );
}
