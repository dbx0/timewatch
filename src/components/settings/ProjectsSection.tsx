import { useRef, useState } from "react";
import { dec } from "../../lib/format";
import { useT } from "../../i18n";
import * as api from "../../lib/api";
import type { Project, ProjectUsage } from "../../lib/types";
import { toast } from "../../stores/toast";
import { Button } from "../ui/Button";
import { textField } from "../ui/field";
import { ColorPicker, PROJECT_PALETTE } from "../ui/ColorPicker";
import { Popover } from "../ui/Popover";
import { Toggle } from "../ui/Toggle";

const txt = textField;

function ColorDot({ project, onPick }: { project: Project; onPick: (c: string) => void }) {
  const t = useT().settings;
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
  const t = useT().settings;
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

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9h6.8L12 4M6.5 6.5v4.5M9.5 6.5v4.5" />
    </svg>
  );
}

export function ProjectsSection({
  projects,
  sessionProjectId = null,
  reload,
}: {
  projects: Project[];
  sessionProjectId?: number | null;
  reload: () => void;
}) {
  const L = useT();
  const t = L.settings;
  const [confirm, setConfirm] = useState<{ id: number; usage: ProjectUsage } | null>(null);
  const [client, setClient] = useState("");
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const fail = (e: unknown) => toast(String(e));
  const save = (p: Project) => api.updateProject(p).then(reload, fail);

  const askDelete = async (p: Project) => {
    if (confirm?.id === p.id) return setConfirm(null);
    try {
      setConfirm({ id: p.id, usage: await api.projectUsage(p.id) });
    } catch (e) {
      fail(e);
    }
  };
  const doDelete = async (p: Project) => {
    setConfirm(null);
    try {
      await api.deleteProject(p.id);
      toast(t.projectDeleted, {
        undo: () => void api.undo().then(reload, fail),
      });
      reload();
    } catch (e) {
      fail(e);
    }
  };

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
              <div key={p.id} className="border-b border-[#1d1d24]">
                <div className={`flex items-center justify-between py-2.5 ${p.archived ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2.5">
                    <ColorDot project={p} onPick={(color) => void save({ ...p, color })} />
                    <Name project={p} onRename={(n) => void save({ ...p, name: n })} />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-dim">{p.archived ? t.archived : t.active}</span>
                    <Toggle label={t.activeLabel(p.name)} checked={!p.archived} onChange={(on) => void save({ ...p, archived: !on })} />
                    <span title={p.id === sessionProjectId ? t.deleteBlocked : undefined} className="inline-flex">
                      <button
                        type="button"
                        aria-label={t.deleteProject(p.name)}
                        disabled={p.id === sessionProjectId}
                        onClick={() => void askDelete(p)}
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-mute outline-none transition hover:bg-raise2 hover:text-white focus-visible:ring-2 focus-visible:ring-accent2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-mute"
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  </div>
                </div>
                {confirm?.id === p.id && (
                  <div role="alertdialog" className="mb-2.5 flex items-center justify-between gap-3 rounded-[10px] bg-raise px-3 py-2.5">
                    <span className="text-[13px]">
                      {confirm.usage.entries === 0
                        ? t.deleteConfirmEmpty(p.name)
                        : t.deleteConfirmUsed(p.name, dec(confirm.usage.ms) || "0", confirm.usage.entries)}
                    </span>
                    <div className="flex flex-none gap-2">
                      <Button variant="primary" size="sm" onClick={() => void doDelete(p)}>
                        {confirm.usage.entries === 0 ? t.deleteConfirm : t.deleteAll}
                      </Button>
                      <Button size="sm" onClick={() => setConfirm(null)}>{L.notch.cancel}</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
