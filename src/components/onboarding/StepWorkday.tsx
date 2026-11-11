import { useT } from "../../i18n";
import { JornadaEditor } from "../settings/JornadaEditor";

export function StepWorkday({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const t = useT().onboarding;
  return (
    <>
      <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">{t.workdayTitle}</h2>
      <p className="mb-2 text-[15px] text-mute">{t.workdayLead}</p>
      <JornadaEditor value={value} onChange={onChange} />
    </>
  );
}
