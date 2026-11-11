import { SettingsApp } from "../components/settings/SettingsApp";
import { WindowFrame } from "../components/ui/WindowFrame";
import { useT } from "../i18n";

export function Settings() {
  const L = useT();
  return (
    <WindowFrame title={L.titlebar.settings}>
      <SettingsApp />
    </WindowFrame>
  );
}
