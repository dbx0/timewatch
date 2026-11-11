import type { ReactNode } from "react";
import { TitleBar } from "./TitleBar";

/** Rounded, bordered frame for the borderless (transparent) app windows, with the custom title bar. */
export function WindowFrame({ title, resizable = true, children }: { title: string; resizable?: boolean; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/[.06] bg-win">
      <TitleBar title={title} resizable={resizable} />
      <div className="relative min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
