import { useT } from "../../i18n";
import { clientLabel } from "../../lib/client";
import { PROJECT_PALETTE } from "../ui/ColorPicker";
import type { DraftProject } from "./StepProjects";

const opt =
  "mb-2 flex w-full cursor-pointer items-center gap-3 rounded-xl bg-raise px-3.5 py-3 text-left outline-none transition-colors hover:bg-raise2 focus-visible:ring-2 focus-visible:ring-accent2";

export function StepStart({ projects, onStart }: { projects: DraftProject[]; onStart: (index: number | null) => void }) {
  const L = useT();
  const t = L.onboarding;
  return (
    <>
      <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">{t.startTitle}</h2>
      <p className="mb-5 text-[15px] text-mute">{t.startLead}</p>
      <div className="max-h-[230px] overflow-auto">
        {projects.map((p, i) => (
          <button key={i} type="button" aria-label={t.startProject(p.name)} className={opt} onClick={() => onStart(i)}>
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: PROJECT_PALETTE[i % PROJECT_PALETTE.length] }} />
            <b className="min-w-0 truncate">{p.name}</b>
            <span className="text-mute">{clientLabel(p.client, L)}</span>
            <span className="ml-auto text-accent2">▶</span>
          </button>
        ))}
      </div>
      <button type="button" className={opt} onClick={() => onStart(null)}>
        <span className="text-mute">{t.startNone}</span>
      </button>
    </>
  );
}
