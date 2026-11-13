import { useState } from "react";
import { useLang, useT } from "../../i18n";
import { clientKey, clientLabel, sortedClients } from "../../lib/client";
import type { Project } from "../../lib/types";
import { useTracker } from "../../stores/tracker";
import { switchTo } from "./actions";
import { ProjectRow, useListNav, useTodayById } from "./ProjectSearch";

const link = "cursor-pointer rounded-md text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent2";

/** All active projects grouped by client. The list takes focus (Tab) and arrows move through it. */
export function AllProjects({ onBack, onCreate }: { onBack: () => void; onCreate: () => void }) {
  const L = useT();
  const s = L.notch;
  const lang = useLang((st) => st.lang);
  const snapshot = useTracker((st) => st.snapshot);
  const todayOf = useTodayById();
  const active = snapshot?.projects.filter((p) => !p.archived) ?? [];
  const clients = sortedClients(active.map((p) => p.client), lang);
  const groups = clients.map((c) => ({ client: c, projects: active.filter((p) => clientKey(p.client) === c) }));
  const flat = groups.flatMap((g) => g.projects);
  const nav = useListNav(flat.length, { min: 0 });
  const [focused, setFocused] = useState(false);
  if (!snapshot) return null;
  const current = snapshot.sessionProject?.id ?? null;
  const pick = (p: Project) => {
    void switchTo(p);
    onBack();
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <button type="button" className={link} onClick={onBack}>{s.back}</button>
        <b>{s.allProjects}</b>
        <button type="button" className={link} onClick={onCreate}>{s.newShort}</button>
      </div>
      <div
        role="listbox"
        aria-label={s.allProjects}
        tabIndex={flat.length ? 0 : -1}
        aria-activedescendant={flat.length ? nav.activeId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (nav.onKey(e)) return;
          if ((e.key === "Enter" || e.key === " ") && flat[nav.active]) {
            e.preventDefault();
            pick(flat[nav.active]);
          }
        }}
        className="mt-1.5 max-h-[360px] overflow-auto rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-accent2"
      >
        {flat.length === 0 && <div className="px-2.5 py-3.5 text-[13px] text-mute">{s.emptyAll}</div>}
        {groups.map((g) => (
          <div key={g.client || "\u0000"} role="group" aria-label={clientLabel(g.client, L)}>
            <div aria-hidden className="mb-0.5 ml-2.5 mt-2.5 text-[11px] uppercase tracking-[.06em] text-dim">{clientLabel(g.client, L)}</div>
            {g.projects.map((p) => {
              const i = flat.indexOf(p);
              return (
                <ProjectRow
                  key={p.id}
                  id={nav.idOf(i)}
                  active={focused && i === nav.active}
                  p={p}
                  today={todayOf(p.id)}
                  current={p.id === current}
                  onPick={pick}
                />
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
