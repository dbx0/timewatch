import { useEffect, useState, type Ref } from "react";
import { ptBR } from "../../i18n/pt-BR";
import { openWindow } from "../../lib/api";
import { clock } from "../../lib/format";
import type { WindowKind } from "../../lib/types";
import { liveSessionMs, liveTodayMs, useTracker } from "../../stores/tracker";
import { stop, switchTo, togglePause } from "./actions";
import { DayProgress } from "./DayProgress";
import { CalIcon, Dot, GearIcon, PauseIcon, PlayIcon, StopIcon } from "./icons";
import { isTyping } from "./keyboard";
import { ProjectSearch } from "./ProjectSearch";

const s = ptBR.notch;

interface Props {
  onCreate: (name: string) => void;
  onAll: () => void;
  /** Footer actions close the panel. */
  onClose: () => void;
  inputRef?: Ref<HTMLInputElement>;
}

const round =
  "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full outline-none transition active:scale-[.92] focus-visible:ring-2 focus-visible:ring-accent2";

export function Panel({ onCreate, onAll, onClose, inputRef }: Props) {
  const snapshot = useTracker((st) => st.snapshot);
  const sessionMs = useTracker(liveSessionMs);
  const todayMs = useTracker(liveTodayMs);
  const [query, setQuery] = useState("");

  // Panel shortcuts (only while it is mounted, i.e. open on the main view).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      // A focused control handles its own Space (avoid toggling twice).
      if (e.key === " " && e.target instanceof Element && e.target.closest("button,[role=radio],[role=switch],[role=option]")) return;
      if (e.key === " ") {
        e.preventDefault();
        void togglePause();
      } else if (/^[1-4]$/.test(e.key)) {
        const r = useTracker.getState().snapshot?.recents.find((x) => x.shortcut === Number(e.key));
        if (r) void switchTo(r.project);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!snapshot) return null;
  const { status, sessionProject: p } = snapshot;

  const footer = (kind: WindowKind) => () => {
    void openWindow(kind).catch(() => {});
    onClose();
  };

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-h-[22px] items-center gap-2 text-[13px] text-mute">
            {p ? (
              <>
                <Dot color={p.color} />
                <span className="truncate">
                  {p.client} · <span className="text-text">{p.name}</span>
                </span>
              </>
            ) : (
              s.noProject
            )}
            {status === "paused" && (
              <span className="flex-none rounded-full bg-[#1c2640] px-2.5 py-[3px] text-xs text-accent2">{s.paused}</span>
            )}
          </div>
          <div
            className={`mt-0.5 font-mono text-[40px] font-semibold leading-[1.05] tracking-[-.5px] tabular-nums ${
              status === "paused" ? "text-accent2" : status === "idle" ? "text-dim" : "text-text"
            }`}
          >
            {clock(sessionMs)}
          </div>
        </div>
        <div className="flex flex-none gap-2">
          {status === "running" && (
            <button type="button" aria-label={s.pause} title={s.pause} onClick={() => void togglePause()}
              className={`${round} bg-raise2 text-text hover:bg-[#30303a]`}>
              <PauseIcon />
            </button>
          )}
          {status === "paused" && (
            <button type="button" aria-label={s.resume} title={s.resume} onClick={() => void togglePause()}
              className={`${round} bg-white hover:bg-[#dfe8ff]`}>
              <PlayIcon />
            </button>
          )}
          {status !== "idle" && (
            <button type="button" aria-label={s.stop} title={s.stop} onClick={() => void stop()}
              className={`${round} bg-raise2 text-text hover:bg-[#2a3550]`}>
              <StopIcon />
            </button>
          )}
        </div>
      </div>
      <DayProgress todayMs={todayMs} jornadaMs={snapshot.todayJornadaMs} />
      <ProjectSearch
        query={query}
        onQueryChange={setQuery}
        onCreate={onCreate}
        onAll={onAll}
        onSwitched={() => setQuery("")}
        inputRef={inputRef}
      />
      <div className="mt-2.5 flex justify-between border-t border-[#1c1c22] pt-2.5 text-[13px]">
        <button type="button" onClick={footer("report")}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-mute outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent2">
          <CalIcon /> {s.weekHours}
        </button>
        <button type="button" onClick={footer("settings")}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-mute outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent2">
          <GearIcon /> {s.settings}
        </button>
      </div>
    </>
  );
}
