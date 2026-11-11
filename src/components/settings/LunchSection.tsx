import { ptBR } from "../../i18n/pt-BR";
import { Stepper } from "../ui/Stepper";
import { TimePicker } from "../ui/TimePicker";
import { Row, type SectionProps } from "./Row";

const t = ptBR.settings;

export function LunchSection({ settings, update }: SectionProps) {
  return (
    <>
      <h3 className="mb-1 text-lg font-semibold">{t.lunchTitle}</h3>
      <Row title={t.lunchDuration} hint={t.lunchDurationHint}>
        <Stepper
          value={settings.lunchMin}
          step={15}
          min={0}
          max={180}
          format={(v) => `${v} min`}
          onChange={(v) => update({ lunchMin: v })}
        />
      </Row>
      <Row title={t.lunchRef} hint={t.lunchRefHint}>
        <TimePicker
          value={settings.lunchRef.slice(0, 5)}
          onChange={(v) => update({ lunchRef: `${v}:00` })}
        />
      </Row>
    </>
  );
}
