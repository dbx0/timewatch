import type { ReactNode } from "react";

export function Row({ title, hint, note, children }: { title: string; hint?: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-[#1d1d24] py-3.5">
      <div>
        <div className="font-medium">{title}</div>
        {hint && <div className="mt-0.5 max-w-[380px] text-xs text-mute">{hint}</div>}
        {note && <div role="note" className="mt-1 max-w-[380px] text-xs text-accent2">{note}</div>}
      </div>
      {children}
    </div>
  );
}

export interface SectionProps {
  settings: import("../../lib/types").Settings;
  /** Applies at once; the promise settles when the save does (failures are already toasted). */
  update: (patch: Partial<import("../../lib/types").Settings>) => Promise<void>;
}
