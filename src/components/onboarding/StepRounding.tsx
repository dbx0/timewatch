import { ptBR } from "../../i18n/pt-BR";
import { dec, roundMs } from "../../lib/format";
import { Segmented } from "../ui/Segmented";

const t = ptBR.onboarding;
const OPTIONS = [
  { value: 0, label: ptBR.settings.exact },
  { value: 15, label: ptBR.settings.min15 },
  { value: 30, label: ptBR.settings.min30 },
];
const EXAMPLE_MS = (2 * 60 + 10) * 60_000;

export function StepRounding({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <>
      <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">{t.roundingTitle}</h2>
      <p className="mb-5 text-[15px] text-mute">{t.roundingLead}</p>
      <div className="flex items-center justify-between gap-4 py-3.5">
        <div className="font-medium">{t.roundingLabel}</div>
        <Segmented ariaLabel={t.roundingLabel} value={value} options={OPTIONS} onChange={onChange} />
      </div>
      <div className="rounded-xl bg-raise px-3.5 py-3 text-[13px] text-mute">
        {t.exampleA}
        <b data-testid="rounding-example" className="mx-1 text-text">{dec(roundMs(EXAMPLE_MS, value))}</b>
        {t.exampleB}
      </div>
    </>
  );
}
