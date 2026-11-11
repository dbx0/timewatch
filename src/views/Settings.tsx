import { SettingsApp } from "../components/settings/SettingsApp";
import { WindowFrame } from "../components/ui/WindowFrame";
import { ptBR } from "../i18n/pt-BR";

export function Settings() {
  return (
    <WindowFrame title={ptBR.titlebar.settings}>
      <SettingsApp />
    </WindowFrame>
  );
}
