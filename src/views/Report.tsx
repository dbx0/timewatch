import { ReportApp } from "../components/report/ReportApp";
import { WindowFrame } from "../components/ui/WindowFrame";
import { ptBR } from "../i18n/pt-BR";

export function Report() {
  return (
    <WindowFrame title={ptBR.titlebar.report}>
      <ReportApp />
    </WindowFrame>
  );
}
