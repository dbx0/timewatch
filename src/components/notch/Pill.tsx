import { motion } from "framer-motion";
import { ptBR } from "../../i18n/pt-BR";
import { clock } from "../../lib/format";
import type { OverlayConfig, TrackerSnapshot } from "../../lib/types";
import { Dot, PauseIcon } from "./icons";

const s = ptBR.notch;
const IDLE_DOT = "#444";
/** Strip mode: the pill the thin bar grows into on hover. */
export const STRIP_PILL = { w: 280, h: 32 };

interface Props {
  config: OverlayConfig;
  snapshot: TrackerSnapshot | null;
  sessionMs: number;
  /** Strip mode only: hovered, show the full pill instead of the bar. */
  grown: boolean;
  onClick: () => void;
}

const pillBase = "flex cursor-pointer select-none items-center bg-black text-[13px] font-semibold whitespace-nowrap text-white";

export function Pill({ config, snapshot, sessionMs, grown, onClick }: Props) {
  const status = snapshot?.status ?? "idle";
  const p = snapshot?.sessionProject ?? null;
  const time = clock(sessionMs);

  if (config.mode === "notch") {
    const notchW = config.notchWidth ?? 0;
    const ear = Math.max(0, (config.pillWidth - notchW) / 2);
    return (
      <div
        data-pill="notch"
        onClick={onClick}
        className={pillBase}
        style={{ width: config.pillWidth, height: config.pillHeight, borderRadius: `0 0 ${Math.min(18, config.pillHeight / 2)}px ${Math.min(18, config.pillHeight / 2)}px` }}
      >
        <div className="flex min-w-0 items-center justify-center gap-2 px-3" style={{ width: ear }}>
          {status === "running" && p && (
            <>
              <Dot color={p.color} />
              <span className="min-w-0 truncate">{p.name}</span>
            </>
          )}
          {status === "paused" && p && (
            <>
              <span className="flex flex-none text-accent2"><PauseIcon /></span>
              <span className="min-w-0 truncate font-medium text-[#9a9aa5]">{p.name}</span>
            </>
          )}
          {status === "idle" && (
            <>
              <Dot color={IDLE_DOT} />
              <span className="min-w-0 truncate font-medium text-[#9a9aa5]">{s.idleLeft}</span>
            </>
          )}
        </div>
        <div className="flex-none" style={{ width: notchW }} />
        <div className="flex min-w-0 items-center justify-center px-3" style={{ width: ear }}>
          {status === "idle" ? (
            <span className="truncate font-medium text-[#9a9aa5]">{s.idleRight}</span>
          ) : (
            <span className="font-mono tabular-nums" style={{ color: status === "paused" ? "var(--accent2)" : p?.color }}>
              {time}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (!grown) {
    const color = status === "running" && p ? p.color : status === "paused" ? "var(--accent2)" : "var(--dim)";
    return (
      <div
        data-pill="strip"
        onClick={onClick}
        className="cursor-pointer rounded-b-[4px]"
        style={{ width: config.pillWidth, height: config.pillHeight, background: color }}
      />
    );
  }

  return (
    <motion.div
      data-pill="grown"
      onClick={onClick}
      initial={{ scaleX: config.pillWidth / STRIP_PILL.w, scaleY: config.pillHeight / STRIP_PILL.h }}
      animate={{ scaleX: 1, scaleY: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={`${pillBase} justify-center gap-2.5 rounded-b-[18px] px-[18px]`}
      style={{ width: STRIP_PILL.w, height: STRIP_PILL.h, transformOrigin: "top center" }}
    >
      {status === "running" && p && (
        <>
          <Dot color={p.color} />
          <span className="min-w-0 truncate">{p.name}</span>
          <span className="font-mono tabular-nums" style={{ color: p.color }}>{time}</span>
        </>
      )}
      {status === "paused" && p && (
        <>
          <span className="flex flex-none text-accent2"><PauseIcon /></span>
          <span className="min-w-0 truncate font-medium text-[#9a9aa5]">{p.name}</span>
          <span className="font-mono tabular-nums text-accent2">{time}</span>
        </>
      )}
      {status === "idle" && (
        <>
          <Dot color={IDLE_DOT} />
          <span className="font-medium text-[#9a9aa5]">{s.idle}</span>
        </>
      )}
    </motion.div>
  );
}
