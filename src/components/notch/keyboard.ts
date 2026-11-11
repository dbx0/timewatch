import { overlayFocus } from "../../lib/api";

const ECHO_MS = 800;
/** Last `overlay_focus` we asked for (any reason) and the last one asked for by an input click. */
let requestAt = 0;
let inputRequestAt = 0;

/** Makes the overlay window key so it receives Esc and blur. */
export function requestKeyboard() {
  requestAt = Date.now();
  void overlayFocus().catch(() => {});
}

/**
 * The overlay is not key while opened by hover. Before an input can take typing, ask the
 * backend to make the window key (`overlay_focus`), then focus the element.
 */
export async function focusWithKeyboard(el: HTMLElement | null) {
  if (!el) return;
  if (!document.hasFocus()) {
    requestAt = inputRequestAt = Date.now();
    try {
      await overlayFocus();
    } catch {
      // Still try to focus: the webview may already be key.
    }
  }
  el.focus();
}

/** `overlay_focus` echoes `overlay://expanded true`: true while one of our requests is in flight. */
export const focusRequested = () => Date.now() - requestAt < ECHO_MS;
/** It also echoes `overlay://focus-search`; ignore that echo when an input asked for focus itself. */
export const isFocusEcho = () => Date.now() - inputRequestAt < ECHO_MS;

/** Test hook. */
export const resetFocusRequests = () => {
  requestAt = inputRequestAt = 0;
};

export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
