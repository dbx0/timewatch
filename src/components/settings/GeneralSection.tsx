import { useEffect, useState } from "react";
import { availableMonitors } from "@tauri-apps/api/window";
import { LANGS, LANGUAGE_NAMES, useT, type LanguagePref } from "../../i18n";
import { Dropdown } from "../ui/Dropdown";
import { Segmented } from "../ui/Segmented";
import { Toggle } from "../ui/Toggle";
import { Row, type SectionProps } from "./Row";
import { formatShortcut, isMac, shortcutFromEvent } from "./shortcut";

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const t = useT().settings;
  const [recording, setRecording] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${t.shortcut}: ${formatShortcut(value)}`}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setRecording(true);
          }
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          setRecording(false);
          return;
        }
        const combo = shortcutFromEvent(e.nativeEvent);
        if (!combo) return;
        setRecording(false);
        if (combo !== value) onChange(combo);
      }}
      className={`min-w-[120px] cursor-pointer select-none rounded-[9px] px-3 py-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-accent2 ${
        recording ? "bg-accent/20 text-accent2 ring-1 ring-accent" : "bg-raise text-text hover:bg-raise2"
      }`}
    >
      {recording ? t.shortcutRecording : formatShortcut(value, isMac())}
    </div>
  );
}

export function GeneralSection({ settings, update }: SectionProps) {
  const L = useT();
  const t = L.settings;
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let off = false;
    availableMonitors()
      .then((ms) => {
        if (!off) setNames(ms.map((m) => m.name ?? "").filter((n) => n));
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);

  const stored = settings.overlayMonitor;
  const all = Array.from(new Set(stored && !names.includes(stored) ? [...names, stored] : names));
  const options = [
    { value: "", label: t.mainScreen },
    ...all.map((n) => ({ value: n, label: n })),
  ];

  return (
    <>
      <h3 className="mb-1 text-lg font-semibold">{L.settings.nav.general}</h3>
      <Row title={L.language.label} hint={L.language.hint}>
        <Dropdown<LanguagePref>
          ariaLabel={L.language.label}
          value={settings.language}
          options={[
            { value: "system", label: L.language.system },
            ...LANGS.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
          ]}
          onChange={(v) => update({ language: v })}
        />
      </Row>
      <Row title={t.rounding} hint={t.roundingHint}>
        <Segmented
          ariaLabel={t.rounding}
          value={settings.roundingMin}
          options={[
            { value: 0, label: t.exact },
            { value: 15, label: t.min15 },
            { value: 30, label: t.min30 },
          ]}
          onChange={(v) => update({ roundingMin: v })}
        />
      </Row>
      <Row title={t.autostart} hint={t.autostartHint}>
        <Toggle label={t.autostart} checked={settings.autostart} onChange={(v) => update({ autostart: v })} />
      </Row>
      <Row title={t.shortcut} hint={t.shortcutHint}>
        <ShortcutRecorder value={settings.shortcut} onChange={(s) => update({ shortcut: s })} />
      </Row>
      <Row title={t.monitor} hint={t.monitorHint}>
        <Dropdown
          ariaLabel={t.monitor}
          value={stored ?? ""}
          options={options}
          onChange={(v) => update({ overlayMonitor: v === "" ? null : v })}
        />
      </Row>
    </>
  );
}
