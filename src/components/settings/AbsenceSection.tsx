import { useT } from "../../i18n";
import { Stepper } from "../ui/Stepper";
import { Toggle } from "../ui/Toggle";
import { Row, type SectionProps } from "./Row";

export function AbsenceSection({ settings, update }: SectionProps) {
  const t = useT().settings;
  return (
    <>
      <h3 className="mb-1 text-lg font-semibold">{t.absenceTitle}</h3>
      <Row title={t.idle} hint={t.idleHint}>
        <Stepper
          ariaLabel={t.idle}
          value={settings.idleMin}
          step={5}
          min={5}
          max={120}
          format={(v) => `${v} min`}
          onChange={(v) => update({ idleMin: v })}
        />
      </Row>
      <Row title={t.stopOnSleep} hint={t.stopOnSleepHint} note={t.stopOnSleepNote}>
        <Toggle label={t.stopOnSleep} checked={settings.stopOnSleep} onChange={(v) => update({ stopOnSleep: v })} />
      </Row>
    </>
  );
}
