import { useEffect, useState } from "react";
import { LANGS, LANGUAGE_NAMES, useT, type LanguagePref } from "../../i18n";
import { Dropdown } from "../ui/Dropdown";
import { Segmented } from "../ui/Segmented";
import { Toggle } from "../ui/Toggle";
import * as api from "../../lib/api";
import type { MonitorOption, ShortcutFailure } from "../../lib/types";
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
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [failure, setFailure] = useState<ShortcutFailure | null>(null);
  useEffect(() => {
    let off = false;
    const unlisten = api.onShortcutFailed((f) => !off && setFailure(f));
    Promise.resolve(api.listMonitors())
      .then((ms) => !off && setMonitors(ms ?? []))
      .catch(() => {});
    Promise.resolve(api.getShortcutFailure())
      .then((f) => !off && setFailure(f ?? null))
      .catch(() => {});
    return () => {
      off = true;
      void Promise.resolve(unlisten).then((u) => u?.());
    };
  }, []);

  /** Saves a new shortcut, then asks whether it registered (a success clears the warning). */
  const changeShortcut = (s: string) =>
    update({ shortcut: s }).then(() => Promise.resolve(api.getShortcutFailure()).then((f) => setFailure(f ?? null), () => {}));

  const stored = settings.overlayMonitor;
  const options = [
    { value: "", label: t.mainScreen },
    ...monitors.map((m) => ({ value: m.id, label: m.label })),
    // A stored monitor that is unplugged right now stays visible (and selected).
    ...(stored && !monitors.some((m) => m.id === stored) ? [{ value: stored, label: stored }] : []),
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
      <Row
        title={t.shortcut}
        hint={t.shortcutHint}
        note={failure && failure.shortcut === settings.shortcut ? `${t.shortcutFailed(formatShortcut(failure.shortcut, isMac()))} ${failure.error}` : undefined}
      >
        <ShortcutRecorder value={settings.shortcut} onChange={(s) => void changeShortcut(s)} />
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
