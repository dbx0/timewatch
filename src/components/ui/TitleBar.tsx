import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState, type ReactNode } from "react";
import { ptBR } from "../../i18n/pt-BR";

const t = ptBR.titlebar;

function CtrlButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`group grid h-full w-[46px] cursor-pointer place-items-center bg-transparent text-mute outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent2 ${
        danger ? "hover:bg-accent hover:text-white" : "hover:bg-raise2 hover:text-text"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

export function TitleBar({ title, resizable = true }: { title: string; resizable?: boolean }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!resizable) return;
    const win = getCurrentWindow();
    let off = false;
    let unlisten: (() => void) | undefined;
    const sync = () => void win.isMaximized().then((m) => !off && setMaximized(m)).catch(() => {});
    sync();
    void win.onResized(sync).then((u) => (off ? u() : (unlisten = u))).catch(() => {});
    return () => {
      off = true;
      unlisten?.();
    };
  }, [resizable]);

  // Double-click on the bar toggles maximize via Tauri's built-in drag-region handling.
  const win = () => getCurrentWindow();
  return (
    <div
      data-tauri-drag-region
      className="flex h-10 flex-none select-none items-center justify-between border-b border-line bg-win pl-3.5"
    >
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-text">
        <svg data-tauri-drag-region width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="pointer-events-none">
          <circle cx="7" cy="7" r="5.5" />
          <path d="M7 4v3l2 1.5" />
        </svg>
        <span data-tauri-drag-region className="truncate">{title}</span>
      </div>
      <div className="flex h-full">
        <CtrlButton label={t.minimize} onClick={() => void win().minimize()}>
          <path d="M2 6h8" />
        </CtrlButton>
        {resizable && (
          <CtrlButton label={maximized ? t.restore : t.maximize} onClick={() => void win().toggleMaximize()}>
            {maximized ? (
              <>
                <rect x="2" y="3.5" width="6.5" height="6.5" rx="1" />
                <path d="M4 3.5V2.5a.5.5 0 0 1 .5-.5H9.5a.5.5 0 0 1 .5.5V7.5a.5.5 0 0 1-.5.5H8.5" />
              </>
            ) : (
              <rect x="2" y="2" width="8" height="8" rx="1.2" />
            )}
          </CtrlButton>
        )}
        <CtrlButton label={t.close} danger onClick={() => void win().close()}>
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </CtrlButton>
      </div>
    </div>
  );
}
