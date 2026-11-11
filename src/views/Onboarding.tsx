import { OnboardingApp } from "../components/onboarding/OnboardingApp";
import { WindowFrame } from "../components/ui/WindowFrame";
import { useT } from "../i18n";

export function Onboarding() {
  const L = useT();
  return (
    <WindowFrame title={L.titlebar.onboarding} resizable={false}>
      <OnboardingApp />
    </WindowFrame>
  );
}
