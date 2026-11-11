import { useT } from "../../i18n";
import { Button } from "../ui/Button";

export function StepWelcome({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const t = useT().onboarding;
  return (
    <>
      <div className="mb-6 mt-1.5 flex justify-center">
        <div className="flex h-[38px] min-w-[280px] items-center justify-center gap-2.5 rounded-b-[20px] bg-black px-4 text-sm font-semibold text-white">
          <span className="h-2 w-2 rounded-full" style={{ background: "#5aa9ff" }} />
          <span>{t.welcomeDemo}</span>
          <span className="tabular-nums text-accent2">1:42:10</span>
        </div>
      </div>
      <h2 className="mb-1.5 text-2xl font-semibold tracking-tight">{t.welcomeTitle}</h2>
      <p className="mb-5 text-[15px] text-mute">{t.welcomeLead}</p>
      <div className="mt-[26px] flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onSkip}>{t.skip}</Button>
        <Button variant="primary" onClick={onNext}>{t.setup}</Button>
      </div>
    </>
  );
}
