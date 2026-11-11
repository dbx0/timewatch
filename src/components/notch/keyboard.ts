import { overlayFocus } from "../../lib/api";

let selfFocusAt = 0;

/**
 * The overlay is not key while opened by hover. Before an input can take typing, ask the
 * backend to make the window key (`overlay_focus`), then focus the element.
 */
export async function focusWithKeyboard(el: HTMLElement | null) {
  if (!el) return;
  if (!document.hasFocus()) {
    selfFocusAt = Date.now();
    try {
      await overlayFocus();
    } catch {
      // Still try to focus: the webview may already be key.
    }
  }
  el.focus();
}

/** `overlay_focus` also emits `overlay://focus-search`; ignore that echo when we asked for focus ourselves. */
export const isFocusEcho = () => Date.now() - selfFocusAt < 800;

export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
