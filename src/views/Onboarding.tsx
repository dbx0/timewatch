import { OnboardingApp } from "../components/onboarding/OnboardingApp";
import { WindowFrame } from "../components/ui/WindowFrame";
import { ptBR } from "../i18n/pt-BR";

export function Onboarding() {
  return (
    <WindowFrame title={ptBR.titlebar.onboarding} resizable={false}>
      <OnboardingApp />
    </WindowFrame>
  );
}
