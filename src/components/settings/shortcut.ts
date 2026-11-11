export function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
}

const MODIFIER_CODES = /^(Alt|Control|Shift|Meta|OS)(Left|Right)$/;

function keyName(code: string): string | null {
  if (MODIFIER_CODES.test(code)) return null;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num${code.slice(6)}`;
  if (/^(F\d{1,2}|Arrow(Up|Down|Left|Right)|Space|Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Insert)$/.test(code)) {
    return code;
  }
  const punct: Record<string, string> = {
    Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
    Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
  };
  return punct[code] ?? null;
}

/** Tauri global-shortcut string for a keydown, or null if it has no modifier or no real key. */
export function shortcutFromEvent(e: KeyboardEvent, mac = isMac()): string | null {
  const key = keyName(e.code);
  if (!key) return null;
  const mods: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) mods.push("CommandOrControl");
  if (mac ? e.ctrlKey : e.metaKey) mods.push(mac ? "Control" : "Super");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (mods.length === 0) return null;
  return [...mods, key].join("+");
}

const MAC_SYMBOLS: Record<string, string> = {
  CommandOrControl: "⌘", Command: "⌘", Cmd: "⌘", Super: "⌘", Meta: "⌘",
  Control: "⌃", Ctrl: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧",
};
const MAC_ORDER = ["⌃", "⌥", "⇧", "⌘"];

export function formatShortcut(shortcut: string, mac = isMac()): string {
  const parts = shortcut.split("+");
  if (!mac) return parts.map((p) => (p === "CommandOrControl" || p === "Command" ? "Ctrl" : p)).join("+");
  const key = parts[parts.length - 1];
  const mods = parts
    .slice(0, -1)
    .map((p) => MAC_SYMBOLS[p] ?? p)
    .sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
  return [...mods, key].join(" ");
}
