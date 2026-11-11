import { useT } from "../../i18n";
import type { Project } from "../../lib/types";
import { useTracker } from "../../stores/tracker";
import { switchTo } from "./actions";
import { ProjectRow, useTodayById } from "./ProjectSearch";

const link = "cursor-pointer rounded-md text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent2";

/** All active projects grouped by client. */
export function AllProjects({ onBack, onCreate }: { onBack: () => void; onCreate: () => void }) {
  const s = useT().notch;
  const snapshot = useTracker((st) => st.snapshot);
  const todayOf = useTodayById();
  if (!snapshot) return null;
  const current = snapshot.sessionProject?.id ?? null;
  const active = snapshot.projects.filter((p) => !p.archived);
  const clients = [...new Set(active.map((p) => p.client))].sort((a, b) => a.localeCompare(b, "pt-BR"));
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
      <div role="listbox" className="mt-1.5 max-h-[360px] overflow-auto">
        {clients.length === 0 && <div className="px-2.5 py-3.5 text-[13px] text-mute">{s.emptyAll}</div>}
        {clients.map((c) => (
          <div key={c}>
            <div className="mb-0.5 ml-2.5 mt-2.5 text-[11px] uppercase tracking-[.06em] text-dim">{c}</div>
            {active
              .filter((p) => p.client === c)
              .map((p) => (
                <ProjectRow key={p.id} p={p} today={todayOf(p.id)} current={p.id === current} onPick={pick} />
              ))}
          </div>
        ))}
      </div>
    </>
  );
}
