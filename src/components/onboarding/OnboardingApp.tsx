import { useCallback, useEffect, useRef, useState } from "react";
import { errMsg } from "../../lib/dates";
import { LANGS, LANGUAGE_NAMES, useLang, useT, type LanguagePref } from "../../i18n";
import * as api from "../../lib/api";
import type { Settings } from "../../lib/types";
import { toast } from "../../stores/toast";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { ToastHost } from "../ui/Toast";
import { StepLunch } from "./StepLunch";
import { StepProjects, type DraftProject } from "./StepProjects";
import { StepRounding } from "./StepRounding";
import { StepStart } from "./StepStart";
import { StepWelcome } from "./StepWelcome";
import { StepWorkday } from "./StepWorkday";

const STEPS = 6;

export function OnboardingApp() {
  const L = useT();
  const t = L.onboarding;
  const lang = useLang((s) => s.lang);
  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState<DraftProject[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef<Settings | null>(null);

  const refetch = useCallback(
    () =>
      api.getSettings().then(
        (s) => {
          current.current = s;
          setSettings(s);
        },
        (e: unknown) => toast(errMsg(e)),
      ),
    [],
  );
  useEffect(() => void refetch(), [refetch]);

  /** Steps 3-5 save immediately; a failed save shows what is really stored again. */
  const update = (patch: Partial<Settings>) => {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    current.current = next;
    setSettings(next);
    api.setSettings(next).catch(() => {
      toast(t.saveFailed);
      void refetch();
    });
  };

  const run = (p: Promise<void>) => {
    setBusy(true);
    p.catch((e) => toast(String(e))).finally(() => setBusy(false));
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
      {step === 0 && settings && (
        <div className="-mt-3 flex flex-none justify-end">
          <Dropdown<LanguagePref>
            ariaLabel={L.language.label}
            value={settings.language}
            options={[
              { value: "system", label: L.language.system },
              ...LANGS.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
            ]}
            renderValue={() => <span>{LANGUAGE_NAMES[lang]}</span>}
            onChange={(v) => update({ language: v })}
            className="px-2 py-1 text-[13px]"
          />
        </div>
      )}
      {/* -mx/px: room so focus rings at the edges are not clipped by the scroller. */}
      <div className="-mx-1.5 flex-1 overflow-auto px-1.5 pb-1">
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
