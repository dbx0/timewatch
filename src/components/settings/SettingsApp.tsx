import { useCallback, useEffect, useRef, useState } from "react";
import { ptBR } from "../../i18n/pt-BR";
import * as api from "../../lib/api";
import type { Project, Settings } from "../../lib/types";
import { toast } from "../../stores/toast";
import { ToastHost } from "../ui/Toast";
import { AbsenceSection } from "./AbsenceSection";
import { GeneralSection } from "./GeneralSection";
import { LunchSection } from "./LunchSection";
import { ProjectsSection } from "./ProjectsSection";
import { WorkdaySection } from "./WorkdaySection";

export { JornadaEditor } from "./JornadaEditor";

type Section = "general" | "workday" | "lunch" | "absence" | "projects";
const SECTIONS: Section[] = ["general", "workday", "lunch", "absence", "projects"];

export function SettingsApp() {
  const [section, setSection] = useState<Section>("general");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const current = useRef<Settings | null>(null);

  const apply = (s: Settings) => {
    current.current = s;
    setSettings(s);
  };
  const refetch = useCallback(() => api.getSettings().then(apply).catch(() => {}), []);
  const reloadProjects = useCallback(
    () => api.getSnapshot().then((s) => setProjects(s.projects)).catch(() => {}),
    [],
  );

  useEffect(() => {
    void refetch();
    void reloadProjects();
    let off = false;
    let unlisten: (() => void) | undefined;
    void api.onChanged((s) => setProjects(s.projects)).then((u) => (off ? u() : (unlisten = u)));
    return () => {
      off = true;
      unlisten?.();
    };
  }, [refetch, reloadProjects]);

  const update = (patch: Partial<Settings>) => {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    apply(next);
    api.setSettings(next).catch((e) => {
      toast(String(e));
      void refetch();
    });
  };

  return (
    <div data-view="settings" className="flex h-full bg-win text-[14px] text-text">
      <nav className="w-[190px] flex-none border-r border-[#1d1d24] px-2.5 py-3.5">
        {SECTIONS.map((k) => (
          <div
            key={k}
            role="button"
            tabIndex={0}
            aria-current={section === k}
            onClick={() => setSection(k)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSection(k);
              }
            }}
            className={`mb-0.5 cursor-pointer rounded-[9px] px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent2 ${
              section === k ? "bg-raise2 text-text" : "text-mute hover:bg-raise hover:text-text"
            }`}
          >
            {ptBR.settings.nav[k]}
          </div>
        ))}
      </nav>
      <main className="flex-1 overflow-auto px-[26px] py-[22px]">
        {settings && section === "general" && <GeneralSection settings={settings} update={update} />}
        {settings && section === "workday" && <WorkdaySection settings={settings} update={update} />}
        {settings && section === "lunch" && <LunchSection settings={settings} update={update} />}
        {settings && section === "absence" && <AbsenceSection settings={settings} update={update} />}
        {section === "projects" && <ProjectsSection projects={projects} reload={() => void reloadProjects()} />}
      </main>
      <ToastHost />
    </div>
  );
}
