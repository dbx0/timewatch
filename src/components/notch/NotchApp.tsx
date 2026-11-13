import { motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as api from "../../lib/api";
import type { HitRect, OverlayConfig } from "../../lib/types";
import { useNotePrompt } from "../../stores/notePrompt";
import { toast, useToasts } from "../../stores/toast";
import { liveSessionMs, useTracker } from "../../stores/tracker";
import { ToastHost } from "../ui/Toast";
import { undoable } from "./actions";
import { AbsencePrompt } from "./AbsencePrompt";
import { AllProjects } from "./AllProjects";
import { CreateProject } from "./CreateProject";
import { focusRequested, isFocusEcho, isTyping, requestKeyboard } from "./keyboard";
import { NotePrompt } from "./NotePrompt";
import { Panel } from "./Panel";
import { Pill, STRIP_PILL } from "./Pill";
import { useT } from "../../i18n";
import { formatShortcut } from "../settings/shortcut";

/** First-run tip under the pill. */
export const COACH_MS = 7000;

/** Unpinned panel closes this long after the cursor leaves. */
export const CLOSE_DELAY = 450;
/**
 * Hover must rest on the pill this long before the panel opens, so passing the cursor over the
 * top of the screen never pops it open. A click on the pill opens it right away. In strip mode the
 * bar grows into the pill immediately and the panel follows after this delay.
 */
export const HOVER_OPEN_DELAY = 700;
/** @deprecated kept for tests/imports; strip mode now uses HOVER_OPEN_DELAY. */
export const STRIP_OPEN_DELAY = HOVER_OPEN_DELAY;
/** With an undo toast under the collapsed pill, wait this long to see if the pointer is on the toast. */
export const TOAST_HOVER_GRACE = 80;
const PANEL_W = 440;
const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const;
/** Until `get_overlay_config` answers. */
const FALLBACK: OverlayConfig = { mode: "strip", notchWidth: null, notchHeight: null, pillWidth: 160, pillHeight: 6 };

type View = { kind: "main" } | { kind: "all" } | { kind: "create"; name: string };

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export function NotchApp() {
  const L = useT();
  const snapshot = useTracker((s) => s.snapshot);
  const sessionMs = useTracker(liveSessionMs);
  const toastUndo = useToasts((s) => !!s.current?.undo);
  const [config, setConfig] = useState<OverlayConfig>(FALLBACK);
  const [open, setOpenState] = useState(false);
  const [grown, setGrown] = useState(false);
  const [view, setView] = useState<View>({ kind: "main" });
  const [coach, setCoach] = useState(false);
  const [shortcut, setShortcut] = useState("Alt+Space");
  const coachTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [focusReq, setFocusReq] = useState(0);

  const openRef = useRef(false);
  const pinnedRef = useRef(false);
  const hoveringRef = useRef(false);
  const pending = snapshot?.pendingAbsence ?? null;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const noteFor = useNotePrompt((st) => st.closed);
  const noteRef = useRef(noteFor);
  noteRef.current = noteFor;
  const configRef = useRef(config);
  configRef.current = config;
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const growTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wantSearchFocus = useRef(false);
  const overToastRef = useRef(false);
  const toastUndoRef = useRef(toastUndo);
  toastUndoRef.current = toastUndo;

  const clearTimers = () => {
    clearTimeout(closeTimer.current);
    clearTimeout(growTimer.current);
  };

  const setOpen = useCallback((v: boolean) => {
    if (openRef.current === v) return;
    openRef.current = v;
    setOpenState(v);
    void api.overlaySetExpanded(v).catch(() => {});
  }, []);

  /** Pinning always comes with keyboard focus, so Esc and blur (click outside) can close it. */
  const pin = useCallback(() => {
    if (pinnedRef.current) return;
    pinnedRef.current = true;
    // Our own overlay_focus echoes `expanded true`; don't ask again for it.
    if (!focusRequested()) requestKeyboard();
  }, []);

  const openPanel = useCallback(
    (withPin: boolean) => {
      clearTimers();
      if (withPin) pin();
      setOpen(true);
    },
    [setOpen, pin],
  );

  const closePanel = useCallback(() => {
    clearTimers();
    // The absence question and the note prompt keep the panel open until answered.
    if (pendingRef.current || noteRef.current) return;
    pinnedRef.current = false;
    setOpen(false);
    setView({ kind: "main" });
    setGrown(hoveringRef.current && configRef.current.mode === "strip");
  }, [setOpen]);

  /**
   * Cursor entered the hit rect while collapsed. `onPill` is true when the DOM saw the pointer on
   * the pill itself; otherwise, with an undo toast showing, wait briefly: hovering the toast must
   * not open the panel (the toast would jump away).
   */
  const hoverOpen = useCallback(
    (onPill: boolean) => {
      const strip = configRef.current.mode === "strip";
      if (strip) setGrown(true);
      // The toast grace is shorter than the hover delay, so the rest check below covers both.
      void onPill;
      const delay = Math.max(HOVER_OPEN_DELAY, TOAST_HOVER_GRACE);
      clearTimeout(growTimer.current);
      growTimer.current = setTimeout(() => {
        if (hoveringRef.current && !overToastRef.current) openPanel(false);
      }, delay);
    },
    [openPanel],
  );

  const onHover = useCallback(
    (h: boolean) => {
      hoveringRef.current = h;
      if (h) {
        clearTimeout(coachTimer.current);
        setCoach(false);
        clearTimeout(closeTimer.current);
        if (!openRef.current) hoverOpen(false);
        return;
      }
      clearTimeout(growTimer.current);
      setGrown(false);
      if (openRef.current && !pinnedRef.current && !pendingRef.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(closePanel, CLOSE_DELAY);
      }
    },
    [hoverOpen, closePanel],
  );

  // Backend data and overlay events.
  useEffect(() => {
    const { setSnapshot, setNow, refresh } = useTracker.getState();
    let refreshing = false;
    api.getSnapshot().then((s) => s && setSnapshot(s), () => {});
    api.getOverlayConfig().then((c) => c && setConfig(c), () => {});
    const subs = [
      api.onChanged((s) => setSnapshot(s)),
      api.onTick((now) => {
        setNow(now);
        // Today's totals restart at local midnight: pull a fresh snapshot.
        if (!refreshing && !sameDay(now, useTracker.getState().snapAt)) {
          refreshing = true;
          refresh().finally(() => (refreshing = false)).catch(() => {});
        }
      }),
      api.onOverlayConfig(setConfig),
      api.onOverlayCoach(() => {
        api.getSettings().then((s) => s?.shortcut && setShortcut(s.shortcut), () => {});
        setCoach(true);
        clearTimeout(coachTimer.current);
        coachTimer.current = setTimeout(() => setCoach(false), COACH_MS);
      }),
      api.onOverlayHover(onHover),
      api.onOverlayExpanded(({ expanded, focus }) => {
        // Only user-initiated opens (tray, shortcut) pin and take the keyboard; a system open
        // (absence question) must never steal focus from what the user is typing.
        if (expanded) openPanel(focus);
        else if (pendingRef.current) void api.overlaySetExpanded(true).catch(() => {});
        else closePanel();
      }),
      api.onOverlayFocusSearch(() => {
        if (isFocusEcho()) return;
        openPanel(true);
        setView({ kind: "main" });
        wantSearchFocus.current = true;
        setFocusReq((n) => n + 1);
      }),
    ];
    return () => {
      clearTimers();
      clearTimeout(coachTimer.current);
      subs.forEach((p) => p.then((un) => un(), () => {}));
    };
  }, [onHover, openPanel, closePanel]);

  // Global shortcut: focus the search field once it is rendered (one-shot request).
  useEffect(() => {
    if (!wantSearchFocus.current || !searchRef.current) return;
    wantSearchFocus.current = false;
    searchRef.current.focus();
  }, [focusReq, open, view]);

  /** Dismisses the note prompt without saving (the note can be added later in the day view). */
  const skipNote = useCallback(() => {
    useNotePrompt.getState().clear();
    noteRef.current = null;
    pinnedRef.current = false;
  }, []);

  // Esc closes; losing key focus (a click elsewhere) closes a pinned panel. With the note
  // prompt open, both skip the note and close normally (never trap the panel over the menu bar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openRef.current) {
        e.preventDefault();
        if (noteRef.current) skipNote();
        closePanel();
      }
    };
    const onBlur = () => {
      if (noteRef.current) {
        skipNote();
        closePanel();
      } else if (openRef.current && pinnedRef.current) closePanel();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [closePanel, skipNote]);

  // A pending absence opens the panel; once answered (or undone elsewhere) it closes unless hovered.
  const hadPending = useRef(false);
  useEffect(() => {
    if (pending) {
      hadPending.current = true;
      wantSearchFocus.current = false;
      openPanel(false);
    } else if (hadPending.current) {
      hadPending.current = false;
      pinnedRef.current = false;
      if (!hoveringRef.current) closePanel();
    }
  }, [pending, openPanel, closePanel]);

  // After a pause/stop from the notch the note field takes over, pinned. NotePrompt takes the
  // keyboard itself (focusWithKeyboard, a user action) so the focus-search echo is ignored.
  // Done (saved or skipped): close unless hovered.
  useEffect(() => {
    if (!noteFor) return;
    clearTimers();
    pinnedRef.current = true;
    wantSearchFocus.current = false;
    setOpen(true);
    setView({ kind: "main" });
  }, [noteFor, setOpen]);
  const noteDone = useCallback(() => {
    pinnedRef.current = false;
    noteRef.current = null;
    if (!hoveringRef.current) closePanel();
  }, [closePanel]);

  // Backend notices (e.g. clock stopped when the app closed) become a toast once. Deduped by
  // identity (kind + time): a language switch re-renders the same notice with new text.
  const lastNotice = useRef<string | null>(null);
  const notice = snapshot?.notice ?? null;
  const noticeKey = snapshot?.noticeKey ?? null;
  const canUndo = snapshot?.canUndo ?? false;
  useEffect(() => {
    if (notice && noticeKey !== lastNotice.current) toast(notice, canUndo ? undoable : undefined);
    lastNotice.current = noticeKey;
  }, [notice, noticeKey, canUndo]);

  // Hit rect: the pill/panel, plus the toast while it offers "Desfazer". Layout sizes (offset*)
  // ignore the opening transform, so the final panel size is reported right away.
  const lastRect = useRef("");
  const report = useCallback(() => {
    const s = surfaceRef.current;
    if (!s) return;
    let x0 = s.offsetLeft;
    let y0 = s.offsetTop;
    let x1 = x0 + s.offsetWidth;
    let y1 = y0 + s.offsetHeight;
    const t = toastRef.current;
    if (t && toastUndo && t.offsetHeight > 0) {
      x0 = Math.min(x0, t.offsetLeft);
      y0 = Math.min(y0, t.offsetTop);
      x1 = Math.max(x1, t.offsetLeft + t.offsetWidth);
      y1 = Math.max(y1, t.offsetTop + t.offsetHeight);
    }
    const rect: HitRect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const key = JSON.stringify(rect);
    if (key === lastRect.current) return;
    lastRect.current = key;
    void api.overlaySetHitRect(rect).catch(() => {});
  }, [toastUndo]);
  const reportRef = useRef(report);
  reportRef.current = report;
  useLayoutEffect(() => report());
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => reportRef.current());
    if (surfaceRef.current) ro.observe(surfaceRef.current);
    if (toastRef.current) ro.observe(toastRef.current);
    return () => ro.disconnect();
  }, []);

  const notchInset = config.mode === "notch" ? (config.notchHeight ?? config.pillHeight) : 0;
  const pillW = config.mode === "notch" ? config.pillWidth : grown ? STRIP_PILL.w : config.pillWidth;
  const toMain = () => setView({ kind: "main" });
  // Clicking where the pill was (top of the open panel) closes it.
  const pillArea =
    config.mode === "notch" ? { width: config.pillWidth, height: config.pillHeight } : { width: STRIP_PILL.w, height: 16 };

  return (
    <div data-view="notch" data-state={open ? "open" : "closed"} className="relative flex w-full flex-col items-center text-[14px] leading-[1.4]">
      <div
        ref={surfaceRef}
        data-hit="surface"
        onPointerEnter={() => {
          if (!openRef.current && hoveringRef.current) hoverOpen(true);
        }}
      >
        {open ? (
          <motion.div
            data-panel
            onFocusCapture={(e) => {
              // Typing pins the panel (and makes the window key).
              if (isTyping(e.target)) pin();
            }}
            initial={{ opacity: 0, scaleX: pillW / PANEL_W, scaleY: 0.12 }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
            transition={SPRING}
            className="relative rounded-b-[30px] px-[18px] pb-3.5 text-text shadow-[0_24px_60px_rgba(0,0,0,.6),0_0_0_1px_rgba(255,255,255,.04)]"
            style={{
              width: PANEL_W,
              paddingTop: 16 + notchInset,
              transformOrigin: "top center",
              background: config.mode === "notch" ? "#000" : "var(--panel)",
            }}
          >
            <div
              data-pill-area
              aria-hidden
              onClick={closePanel}
              className="absolute left-1/2 top-0 -translate-x-1/2 cursor-pointer"
              style={pillArea}
            />
            {pending ? (
              <AbsencePrompt onResolved={() => (pinnedRef.current = false)} />
            ) : noteFor ? (
              <NotePrompt onDone={noteDone} />
            ) : view.kind === "all" ? (
              <AllProjects onBack={toMain} onCreate={() => setView({ kind: "create", name: "" })} />
            ) : view.kind === "create" ? (
              <CreateProject initialName={view.name} onBack={toMain} onDone={toMain} />
            ) : (
              <Panel
                inputRef={searchRef}
                onCreate={(name) => setView({ kind: "create", name })}
                onAll={() => setView({ kind: "all" })}
                onClose={closePanel}
              />
            )}
          </motion.div>
        ) : (
          <Pill config={config} snapshot={snapshot} sessionMs={sessionMs} grown={grown} onClick={() => openPanel(false)} />
        )}
      </div>
      {/* Collapsed: right under the pill, so the hit rect has no gap over the desktop. */}
      <div
        ref={toastRef}
        data-hit="toast"
        className={open ? "mt-2" : ""}
        onPointerEnter={() => (overToastRef.current = true)}
        onPointerLeave={() => (overToastRef.current = false)}
      >
        <ToastHost className="pointer-events-none flex justify-center" />
      </div>
      {/* Click-through (not in the hit rect). */}
      {coach && (
        <div
          role="note"
          data-coach
          className="pointer-events-none relative mt-3 max-w-[340px] rounded-xl bg-accent px-3.5 py-2.5 text-center text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,.4)]"
        >
          <span aria-hidden className="absolute -top-1.5 left-1/2 -ml-1.5 border-x-[6px] border-b-[6px] border-x-transparent border-b-accent" />
          {L.onboarding.coach(formatShortcut(shortcut))}
        </div>
      )}
    </div>
  );
}
