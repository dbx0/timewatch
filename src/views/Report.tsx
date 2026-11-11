import { ReportApp } from "../components/report/ReportApp";
import { WindowFrame } from "../components/ui/WindowFrame";
import { useT } from "../i18n";

export function Report() {
  const L = useT();
  return (
    <WindowFrame title={L.titlebar.report}>
      <ReportApp />
    </WindowFrame>
  );
}
