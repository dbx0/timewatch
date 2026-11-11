// Inline icons from the approved prototype.

export const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <rect x="3" y="2" width="3.5" height="12" rx="1" />
    <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
  </svg>
);

export const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="#0a0f1e" aria-hidden>
    <path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5z" />
  </svg>
);

export const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
    <rect x="1" y="1" width="12" height="12" rx="2.5" />
  </svg>
);

export const CalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <rect x="2" y="3" width="12" height="11" rx="2" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
);

export const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </svg>
);

export const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#6b6b76" strokeWidth="1.7" aria-hidden>
    <circle cx="7" cy="7" r="4.8" />
    <path d="M10.5 10.5 14 14" strokeLinecap="round" />
  </svg>
);

export const Dot = ({ color, className = "" }: { color: string; className?: string }) => (
  <span className={`inline-block h-[9px] w-[9px] flex-none rounded-full ${className}`} style={{ background: color }} />
);
