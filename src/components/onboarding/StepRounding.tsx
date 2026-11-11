import { useT } from "../../i18n";
import { dec, roundMs } from "../../lib/format";
import { Segmented } from "../ui/Segmented";

const EXAMPLE_MS = (2 * 60 + 10) * 60_000;

export function StepRounding({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const L = useT();
  const t = L.onboarding;
  const options = [
    { value: 0, label: L.settings.exact },
    { value: 15, label: L.settings.min15 },
    { value: 30, label: L.settings.min30 },
  ];
  return (
    <>
      <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">{t.roundingTitle}</h2>
      <p className="mb-5 text-[15px] text-mute">{t.roundingLead}</p>
      <div className="flex items-center justify-between gap-4 py-3.5">
        <div className="font-medium">{t.roundingLabel}</div>
        <Segmented ariaLabel={t.roundingLabel} value={value} options={options} onChange={onChange} />
      </div>
      <div className="rounded-xl bg-raise px-3.5 py-3 text-[13px] text-mute">
        {t.exampleA}
        <b data-testid="rounding-example" className="mx-1 text-text">{dec(roundMs(EXAMPLE_MS, value))}</b>
        {t.exampleB}
      </div>
    </>
  );
}
