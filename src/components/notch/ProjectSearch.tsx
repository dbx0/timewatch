import { useEffect, useId, useState, type Ref } from "react";
import { useT } from "../../i18n";
import { clientLabel } from "../../lib/client";
import { dur } from "../../lib/format";
import type { Project } from "../../lib/types";
import { liveDelta, useTracker } from "../../stores/tracker";
import { switchTo } from "./actions";
import { Dot, SearchIcon } from "./icons";
import { focusWithKeyboard } from "./keyboard";

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
  return projects.filter((p) => !p.archived && `${p.name} ${clientLabel(p.client)}`.toLowerCase().includes(q));
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

/**
 * Arrow-key navigation over a list of options (a combobox input or a focusable listbox):
 * the active option is announced with aria-activedescendant and scrolled into view.
 * `min` -1 lets ArrowUp go back to "no option" (the search text itself).
 */
export function useListNav(count: number, { min = -1, reset }: { min?: -1 | 0; reset?: unknown } = {}) {
  const base = useId();
  const [active, setActive] = useState<number>(min);
  useEffect(() => setActive(min), [reset, min]);
  const idx = active < count ? active : min;
  const idOf = (i: number) => `${base}-opt-${i}`;
  const activeId = idx >= 0 ? idOf(idx) : undefined;
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);
  /** Handles the arrows/Home/End; true when the key was consumed. */
  const onKey = (e: React.KeyboardEvent): boolean => {
    if (!count) return false;
    let next: number | null = null;
    if (e.key === "ArrowDown") next = Math.min(count - 1, idx + 1);
    else if (e.key === "ArrowUp") next = Math.max(min, idx - 1);
    else if (e.key === "Home" && min === 0) next = 0;
    else if (e.key === "End" && min === 0) next = count - 1;
    if (next === null) return false;
    e.preventDefault();
    setActive(next);
    return true;
  };
  return { active: idx, activeId, idOf, onKey };
}

export function ProjectRow({ p, today, badge, current, onPick, id, active = false }: {
  p: Project;
  today: number;
  badge?: number | null;
  current: boolean;
  onPick: (p: Project) => void;
  id?: string;
  /** Keyboard highlight (aria-activedescendant). */
  active?: boolean;
}) {
  const L = useT();
  return (
    <div
      id={id}
      role="option"
      aria-selected={current}
      data-active={active || undefined}
      onClick={() => onPick(p)}
      className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 ${current ? "bg-[#17213a]" : "hover:bg-raise"} ${
        active ? "ring-1 ring-inset ring-accent2/70" : ""
      }`}
    >
      <Dot color={p.color} />
      <span className="min-w-0 truncate">{p.name}</span>
      <span className="truncate text-xs text-dim">{clientLabel(p.client, L)}</span>
      <span className="ml-auto flex flex-none items-center gap-2 text-xs text-mute">
        {today > 0 ? dur(today) : ""}
        {badge ? <span className="rounded-[5px] bg-raise2 px-1.5 py-px font-mono text-[11px] text-mute">{badge}</span> : null}
      </span>
    </div>
  );
}

const subRow = "flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-mute outline-none hover:bg-raise focus-visible:ring-2 focus-visible:ring-accent2";

export function ProjectSearch({ query, onQueryChange, onCreate, onAll, onSwitched, inputRef }: Props) {
  const s = useT().notch;
  const snapshot = useTracker((st) => st.snapshot);
  const todayOf = useTodayById();
  const raw = query.trim();
  const matches = snapshot && raw ? matchProjects(snapshot.projects, raw) : [];
  const shown = raw ? matches : (snapshot?.recents.map((r) => r.project) ?? []);
  const nav = useListNav(shown.length, { reset: raw });
  const listId = useId();
  if (!snapshot) return null;
  const current = snapshot.sessionProject?.id ?? null;
  const active = snapshot.projects.filter((p) => !p.archived);
  const badgeOf = (id: number) => (raw ? null : snapshot.recents.find((r) => r.project.id === id)?.shortcut);

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
          role="combobox"
          aria-label={s.search}
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={nav.activeId}
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
            if (nav.onKey(e)) return;
            if (e.key !== "Enter") return;
            const chosen = shown[nav.active];
            if (chosen) {
              e.preventDefault();
              pick(chosen);
              return;
            }
            if (!raw) return;
            e.preventDefault();
            if (matches.length) pick(matches[0]);
            else onCreate(raw);
          }}
          className="flex-1 border-0 bg-transparent py-[9px] text-text outline-none placeholder:text-dim"
        />
      </div>
      <div id={listId} role="listbox" aria-label={s.search} className="mt-1.5 max-h-[260px] overflow-auto">
        {!raw && snapshot.recents.length === 0 && <div className="px-2.5 py-3.5 text-[13px] text-mute">{s.empty}</div>}
        {shown.map((p, i) => (
          <ProjectRow
            key={p.id}
            id={nav.idOf(i)}
            active={i === nav.active}
            p={p}
            today={todayOf(p.id)}
            badge={badgeOf(p.id)}
            current={p.id === current}
            onPick={pick}
          />
        ))}
      </div>
      {!raw && active.length > snapshot.recents.length && (
        <button type="button" className={subRow} onClick={onAll}>
          {s.allProjects}
          <span className="ml-auto text-xs">{active.length}</span>
        </button>
      )}
      {raw && (
        <button type="button" className={subRow} onClick={() => onCreate(raw)}>
          {s.createRow(raw)}
        </button>
      )}
    </>
  );
}
