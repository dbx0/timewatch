import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import * as api from "../../lib/api";
import { errMsg } from "../../lib/dates";
import { useT } from "../../i18n";
import type { ExportFormat, Grouping, IsoDate } from "../../lib/types";
import { toast } from "../../stores/toast";
import { Popover } from "../ui/Popover";
import { Toggle } from "../ui/Toggle";

interface Props {
  weekStart: IsoDate;
  grouping: Grouping;
}

export function ExportMenu({ weekStart, grouping }: Props) {
  const t = useT().report;
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [detailed, setDetailed] = useState(false);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    try {
      const path = await save({
        defaultPath: `${t.exportFileName}_${weekStart}.${format}`,
        filters: [{ name: format === "csv" ? "CSV" : "HTML", extensions: [format] }],
      });
      if (!path) return;
      await api.exportWeek(weekStart, grouping, format, detailed, path);
      toast(t.exported(format === "csv" ? t.exportCsv : t.exportHtml));
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const item = (format: ExportFormat, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => void run(format)}
      className="flex w-full cursor-pointer items-center gap-4 rounded-lg px-2.5 py-2 text-left text-text outline-none hover:bg-raise2 focus-visible:ring-2 focus-visible:ring-accent2"
    >
      <b>{label}</b>
      <span className="ml-auto text-xs text-mute">{hint}</span>
    </button>
  );

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-accent px-3.5 py-[9px] font-semibold text-white outline-none transition hover:bg-[#6b9aff] focus-visible:ring-2 focus-visible:ring-accent2 active:scale-[.97]"
      >
        {t.export}
        <span aria-hidden className="text-[10px]">▾</span>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)}>
        <div className="min-w-[290px]">
          {item("csv", t.exportCsv, t.exportCsvHint)}
          {item("html", t.exportHtml, t.exportHtmlHint)}
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-line px-2.5 pt-2.5">
            <span className="text-[13px]">{t.detail}</span>
            <Toggle checked={detailed} onChange={setDetailed} label={t.detail} />
          </div>
        </div>
      </Popover>
    </>
  );
}
