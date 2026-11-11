import { useRef, useState } from "react";
import { ptBR } from "../../i18n/pt-BR";
import * as api from "../../lib/api";
import type { Project } from "../../lib/types";
import { toast } from "../../stores/toast";
import { Button } from "../ui/Button";
import { textField } from "../ui/field";
import { ColorPicker, PROJECT_PALETTE } from "../ui/ColorPicker";
import { Popover } from "../ui/Popover";
import { Toggle } from "../ui/Toggle";

const t = ptBR.settings;
const txt = textField;

function ColorDot({ project, onPick }: { project: Project; onPick: (c: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        title={t.changeColor}
        aria-label={`${t.changeColor}: ${project.name}`}
        onClick={() => setOpen((o) => !o)}
        style={{ background: project.color }}
        className="h-[18px] w-[18px] flex-none cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent2"
      />
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)}>
        <ColorPicker value={project.color} onChange={(c) => { onPick(c); setOpen(false); }} />
      </Popover>
    </>
  );
}

function Name({ project, onRename }: { project: Project; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const n = draft.trim();
    if (commit && n && n !== project.name) onRename(n);
  };
  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        title={t.rename}
        onClick={() => { done.current = false; setDraft(project.name); setEditing(true); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            done.current = false;
            setDraft(project.name);
            setEditing(true);
          }
        }}
        className="cursor-text rounded px-1 outline-none focus-visible:ring-2 focus-visible:ring-accent2"
      >
        {project.name}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      aria-label={t.rename}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") { e.stopPropagation(); finish(false); }
      }}
      className={txt}
    />
  );
}

export function ProjectsSection({ projects, reload }: { projects: Project[]; reload: () => void }) {
  const [client, setClient] = useState("");
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const fail = (e: unknown) => toast(String(e));
  const save = (p: Project) => api.updateProject(p).then(reload, fail);

  const add = async () => {
    const n = name.trim();
    if (!n) {
      nameRef.current?.focus();
      return;
    }
    try {
      await api.createProject(n, client.trim() || t.noClient, PROJECT_PALETTE[projects.length % PROJECT_PALETTE.length]);
      setName("");
      reload();
    } catch (e) {
      fail(e);
    }
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void add();
  };

  const clients = [...new Set(projects.map((p) => p.client))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <>
      <h3 className="mb-1 text-lg font-semibold">{t.projectsTitle}</h3>
      <div className="mb-4 mt-3 flex gap-2">
        <input className={`${txt} flex-1`} placeholder={t.clientPh} value={client} onChange={(e) => setClient(e.target.value)} onKeyDown={onEnter} />
        <input ref={nameRef} className={`${txt} flex-[1.3]`} placeholder={t.projectPh} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} />
        <Button variant="primary" onClick={() => void add()}>{t.add}</Button>
      </div>
      {projects.length === 0 && <div className="py-6 text-center text-dim">{t.noProjects}</div>}
      {clients.map((c) => (
        <div key={c}>
          <div className="ml-0.5 mt-3 text-[11px] uppercase tracking-wide text-dim">{c}</div>
          {projects
            .filter((p) => p.client === c)
            .map((p) => (
              <div key={p.id} className={`flex items-center justify-between border-b border-[#1d1d24] py-2.5 ${p.archived ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2.5">
                  <ColorDot project={p} onPick={(color) => void save({ ...p, color })} />
                  <Name project={p} onRename={(n) => void save({ ...p, name: n })} />
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-dim">{p.archived ? t.archived : t.active}</span>
                  <Toggle label={t.activeLabel(p.name)} checked={!p.archived} onChange={(on) => void save({ ...p, archived: !on })} />
                </div>
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
