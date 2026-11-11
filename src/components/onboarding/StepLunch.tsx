import { useT } from "../../i18n";
import { Segmented } from "../ui/Segmented";
import { TimePicker } from "../ui/TimePicker";

interface Props {
  lunchMin: number;
  lunchRef: string;
  onLunchMin: (v: number) => void;
  onLunchRef: (v: string) => void;
}

export function StepLunch({ lunchMin, lunchRef, onLunchMin, onLunchRef }: Props) {
  const t = useT().onboarding;
  const options = [
    { value: 0, label: t.lunchNone },
    { value: 30, label: t.lunch30 },
    { value: 60, label: t.lunch60 },
    { value: 90, label: t.lunch90 },
  ];
  return (
    <>
      <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">{t.lunchTitle}</h2>
      <p className="mb-5 text-[15px] text-mute">{t.lunchLead}</p>
      <div className="flex items-center justify-between gap-4 border-b border-line py-3.5">
        <div className="font-medium">{t.lunchDuration}</div>
        <Segmented ariaLabel={t.lunchDuration} value={lunchMin} options={options} onChange={onLunchMin} />
      </div>
      <div className="flex items-center justify-between gap-4 py-3.5">
        <div>
          <div className="font-medium">{t.lunchAround}</div>
          <div className="text-[13px] text-mute">{t.lunchAroundHint}</div>
        </div>
        <TimePicker value={lunchRef.slice(0, 5)} onChange={(v) => onLunchRef(`${v}:00`)} />
      </div>
    </>
  );
}
