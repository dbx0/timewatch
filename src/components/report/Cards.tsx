import type { ReactNode } from "react";

export function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[14px] bg-raise px-4 py-3.5">
      <div className="text-xs text-mute">{label}</div>
      <div className={`mt-0.5 text-[26px] font-semibold tabular-nums ${accent ? "text-accent2" : ""}`}>{value}</div>
    </div>
  );
}

export function Cards({ children }: { children: ReactNode }) {
  return <div className="mb-[18px] grid grid-cols-3 gap-3">{children}</div>;
}

export function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-lg text-mute outline-none transition hover:bg-raise2 hover:text-text focus-visible:ring-2 focus-visible:ring-accent2"
    >
      {children}
    </button>
  );
}
