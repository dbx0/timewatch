// The fake desktop: wallpaper, menu bar, the notch overlay and app windows as iframes, plus the
// "Rust side" (backend, events, the overlay hover poll). The driver (render.mjs) moves the pointer
// with __demo.pointer() so the hover poll sees it, like the real app polls the OS cursor.
import { installClock } from "./harness/clock";
import { Backend, OVERLAY } from "./harness/backend";
import type { Host } from "./harness/mock/host";
import type { HitRect } from "../../src/lib/types";
import trayIcon from "../../src-tauri/icons/tray/tray-white.png";

installClock();

const params = new URLSearchParams(location.search);
const scene = params.get("scene") ?? "notch";

type Listener = (e: { event: string; id: number; payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();
let eventId = 0;
const emit = (event: string, payload?: unknown) => {
  const id = ++eventId;
  for (const cb of [...(listeners.get(event) ?? [])]) {
    try {
      cb({ event, id, payload });
    } catch (e) {
      console.error(e);
    }
  }
};

const backend = new Backend(emit, { fresh: scene === "onboarding" });

// ---- windows ------------------------------------------------------------------------------------

const SIZES: Record<string, { w: number; h: number; x: number; y: number }> = {
  report: { w: 1000, h: 740, x: 140, y: 46 },
  settings: { w: 780, h: 600, x: 250, y: 50 },
  onboarding: { w: 640, h: 560, x: 320, y: 62 },
};
const frames = new Map<string, HTMLIFrameElement>();
const appUrl = (view: string) => `./app.html?view=${view}&lang=en`;

function openWindow(kind: string) {
  let f = frames.get(kind);
  if (!f) {
    const r = SIZES[kind];
    f = document.createElement("iframe");
    f.className = "win hidden";
    f.id = `win-${kind}`;
    f.title = kind;
    Object.assign(f.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    f.src = appUrl(kind);
    document.getElementById("windows")!.appendChild(f);
    frames.set(kind, f);
    const el = f;
    f.addEventListener("load", () => setTimeout(() => el.classList.remove("hidden"), 120), { once: true });
  } else {
    f.classList.remove("hidden");
  }
  // Last opened on top.
  let z = 5;
  frames.forEach((x) => (x.style.zIndex = String(x === f ? 10 : z++)));
}

function windowAction(kind: string, action: string) {
  if (action === "close" || action === "minimize") frames.get(kind)?.classList.add("hidden");
}

// ---- overlay ------------------------------------------------------------------------------------

const notch = document.getElementById("notch-frame") as HTMLIFrameElement;
let hitRect: HitRect | null = null;
let expanded = false;

function focusOverlay() {
  expanded = true;
  emit("overlay://expanded", { expanded: true, focus: true });
  notch.contentWindow?.focus();
  emit("overlay://focus-search", null);
}

const pointer = { x: -100, y: -100 };
let hovering = false;
let rest: { x: number; y: number; t: number } | null = null;
let restFired = false;
const REST_RADIUS = 4;
const REST_STILL_MS = 180;

/** Same as window::start_hover_poll: hit rect in, click-through out, rest = hover intent. */
setInterval(() => {
  const box = notch.getBoundingClientRect();
  const rx = pointer.x - box.left;
  const ry = pointer.y - box.top;
  const r = hitRect;
  const inside = !!r && rx >= r.x && rx < r.x + r.w && ry >= r.y && ry < r.y + r.h;
  if (inside !== hovering) {
    hovering = inside;
    notch.style.pointerEvents = inside ? "auto" : "none";
    emit("overlay://hover", inside);
  }
  if (!inside) {
    rest = null;
    restFired = false;
    return;
  }
  const t = performance.now();
  if (!rest || Math.hypot(pointer.x - rest.x, pointer.y - rest.y) > REST_RADIUS) rest = { x: pointer.x, y: pointer.y, t };
  else if (!restFired && t - rest.t >= REST_STILL_MS) {
    restFired = true;
    emit("overlay://rest", null);
  }
}, 33);

// ---- host ---------------------------------------------------------------------------------------

const host: Host = {
  async invoke(cmd, args) {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case "overlay_set_hit_rect":
        hitRect = (a.rect as HitRect | null) ?? null;
        return null;
      case "overlay_set_expanded":
        expanded = !!a.expanded;
        if (!expanded && document.activeElement === notch) notch.blur();
        return null;
      case "overlay_focus":
        focusOverlay();
        return null;
      case "open_window":
        openWindow(String(a.kind));
        return null;
      case "finish_onboarding":
      case "skip_onboarding": {
        const r = await backend.invoke(cmd, a);
        windowAction("onboarding", "close");
        setTimeout(() => emit("overlay://coach", null), 500);
        return r;
      }
      default:
        return backend.invoke(cmd, a);
    }
  },
  listen(event, cb) {
    let set = listeners.get(event);
    if (!set) listeners.set(event, (set = new Set()));
    set.add(cb);
    return () => set!.delete(cb);
  },
  emit,
  writeClipboard(text) {
    backend.clipboard = text;
  },
  windowAction,
};
(window as unknown as { __tw: Host }).__tw = host;

// Rust ticks every second.
setInterval(() => emit("tracker://tick", { now: Date.now() }), 1000);

// ---- menu bar -----------------------------------------------------------------------------------

const fmtClock = () => {
  const d = new Date();
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}  ${time}`;
};
const trayTime = () => {
  const s = backend.snapshot();
  if (s.status === "idle") return "";
  const t = Math.floor(s.sessionMs / 1000);
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}`;
};
const paintBar = () => {
  document.getElementById("clock")!.textContent = fmtClock();
  document.getElementById("tray-time")!.textContent = trayTime();
};
(document.getElementById("tray-icon") as HTMLImageElement).src = trayIcon;
paintBar();
setInterval(paintBar, 1000);

// ---- driver API ---------------------------------------------------------------------------------

const cursor = document.getElementById("cursor")!;
const keycap = document.getElementById("keycap")!;
let keyTimer: ReturnType<typeof setTimeout> | undefined;

const demo = {
  ready: false,
  scene,
  pointer(x: number, y: number) {
    pointer.x = x;
    pointer.y = y;
    cursor.style.transform = `translate(${x - 5}px, ${y - 2.5}px)`;
  },
  press() {
    cursor.classList.remove("down");
    void cursor.offsetWidth;
    cursor.classList.add("down");
  },
  hideCursor(hide: boolean) {
    cursor.style.opacity = hide ? "0" : "1";
  },
  keys(list: string[], ms = 1300) {
    keycap.innerHTML = list.map((k) => `<kbd>${k}</kbd>`).join("");
    keycap.classList.add("on");
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => keycap.classList.remove("on"), ms);
  },
  /** A system open (no keyboard), like the absence question uses. */
  expand() {
    emit("overlay://expanded", { expanded: true, focus: false });
  },
  shortcut() {
    demo.keys(["⌥", "Space"]);
    focusOverlay();
  },
  absence(minutes: number, reason: "idle" | "sleep" = "idle") {
    backend.triggerAbsence(minutes, reason);
  },
  openWindow,
  clipboard: () => backend.clipboard,
  expanded: () => expanded,
};
(window as unknown as { __demo: typeof demo }).__demo = demo;

notch.src = appUrl("notch");
// Overlay config arrives from Rust once the overlay is placed.
notch.addEventListener("load", () => setTimeout(() => emit("overlay://config", OVERLAY), 50), { once: true });
if (scene === "report" || scene === "settings" || scene === "onboarding") openWindow(scene);
demo.ready = true;
