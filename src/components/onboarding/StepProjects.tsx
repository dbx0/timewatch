import { useRef, useState } from "react";
import { useT } from "../../i18n";
import { PROJECT_PALETTE } from "../ui/ColorPicker";
import { Button } from "../ui/Button";
import { textField } from "../ui/field";

const txt = textField;

export interface DraftProject {
  name: string;
  client: string;
}

interface Props {
  projects: DraftProject[];
  onChange: (next: DraftProject[]) => void;
}

export function StepProjects({ projects, onChange }: Props) {
  const L = useT();
  const t = L.onboarding;
  const [client, setClient] = useState("");
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const clients = [...new Set(projects.map((p) => p.client).filter(Boolean))];

  const add = () => {
    const n = name.trim();
    if (!n) {
      nameRef.current?.focus();
      return;
    }
    onChange([...projects, { name: n, client: client.trim() || L.settings.noClient }]);
    setName("");
    nameRef.current?.focus();
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <>
      <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">{t.projectsTitle}</h2>
      <p className="mb-5 text-[15px] text-mute">{t.projectsLead}</p>
      <div className="flex gap-2">
        <input
          aria-label={L.settings.clientPh}
          className={`${txt} min-w-0 flex-1`}
          placeholder={t.clientPh}
          value={client}
          onChange={(e) => setClient(e.target.value)}
          onKeyDown={onEnter}
        />
        <input
          ref={nameRef}
          autoFocus
          aria-label={L.settings.projectPh}
          className={`${txt} min-w-0 flex-[1.3]`}
          placeholder={t.projectPh}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onEnter}
        />
        <Button onClick={add}>{t.add}</Button>
      </div>
      {clients.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-dim">{t.clients}</span>
          {clients.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setClient(c);
                nameRef.current?.focus();
              }}
              className="cursor-pointer rounded-full bg-accent/20 px-2.5 py-1 text-xs text-accent2 outline-none hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-accent2"
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3.5 max-h-[170px] overflow-auto">
        {projects.length === 0 && <div className="px-0.5 py-2.5 text-[13px] text-dim">{t.noProjectsYet}</div>}
        {projects.map((p, i) => (
          <div key={i} className="mb-1.5 flex items-center gap-2.5 rounded-[10px] bg-raise px-2.5 py-2">
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: PROJECT_PALETTE[i % PROJECT_PALETTE.length] }} />
            <span className="min-w-0 truncate">{p.name}</span>
            <span className="text-xs text-dim">{p.client}</span>
            <button
              type="button"
              aria-label={t.remove(p.name)}
              onClick={() => onChange(projects.filter((_, j) => j !== i))}
              className="ml-auto cursor-pointer rounded-md px-1.5 text-mute outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent2"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
