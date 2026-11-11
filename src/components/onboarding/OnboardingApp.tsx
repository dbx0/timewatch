import { useEffect, useRef, useState } from "react";
import { ptBR } from "../../i18n/pt-BR";
import * as api from "../../lib/api";
import type { Settings } from "../../lib/types";
import { toast } from "../../stores/toast";
import { Button } from "../ui/Button";
import { ToastHost } from "../ui/Toast";
import { StepLunch } from "./StepLunch";
import { StepProjects, type DraftProject } from "./StepProjects";
import { StepRounding } from "./StepRounding";
import { StepStart } from "./StepStart";
import { StepWelcome } from "./StepWelcome";
import { StepWorkday } from "./StepWorkday";

const t = ptBR.onboarding;
const STEPS = 6;

export function OnboardingApp() {
  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState<DraftProject[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef<Settings | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      current.current = s;
      setSettings(s);
    }, () => {});
  }, []);

  /** Steps 3-5 save immediately. */
  const update = (patch: Partial<Settings>) => {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    current.current = next;
    setSettings(next);
    api.setSettings(next).catch(() => toast(t.saveFailed));
  };

  const run = (p: Promise<void>) => {
    setBusy(true);
    p.catch((e) => {
      toast(String(e));
      setBusy(false);
    });
  };
  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const dots = (
    <div className="flex gap-1.5" role="img" aria-label={t.steps(step + 1, STEPS)}>
      {Array.from({ length: STEPS }, (_, i) => (
        <i
          key={i}
          data-on={i === step}
          className={`block h-1.5 rounded-full ${i === step ? "w-[18px] bg-accent" : "w-1.5 bg-raise2"}`}
        />
      ))}
    </div>
  );

  return (
    <div data-view="onboarding" className="flex h-full flex-col bg-win px-[34px] pb-6 pt-[30px] text-[14px] text-text">
      <div className="flex-1 overflow-auto">
        {step === 0 && <StepWelcome onNext={next} onSkip={() => run(api.skipOnboarding())} />}
        {step === 1 && <StepProjects projects={projects} onChange={setProjects} />}
        {step === 2 && settings && <StepWorkday value={settings.jornadaH} onChange={(v) => update({ jornadaH: v })} />}
        {step === 3 && settings && (
          <StepLunch
            lunchMin={settings.lunchMin}
            lunchRef={settings.lunchRef}
            onLunchMin={(v) => update({ lunchMin: v })}
            onLunchRef={(v) => update({ lunchRef: v })}
          />
        )}
        {step === 4 && settings && <StepRounding value={settings.roundingMin} onChange={(v) => update({ roundingMin: v })} />}
        {step === 5 && <StepStart projects={projects} onStart={(i) => !busy && run(api.finishOnboarding(projects, i))} />}
      </div>
      {step > 0 && (
        <div className="mt-[18px] flex flex-none items-center justify-between">
          {dots}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={back}>{t.back}</Button>
            {step < STEPS - 1 && (
              <Button variant="primary" disabled={step === 1 && projects.length === 0} onClick={next}>
                {t.next}
              </Button>
            )}
          </div>
        </div>
      )}
      {step === 0 && <div className="mt-[18px] flex-none">{dots}</div>}
      <ToastHost />
    </div>
  );
}
