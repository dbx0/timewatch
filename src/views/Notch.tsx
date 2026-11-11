import { useEffect, useRef } from "react";
import { overlaySetHitRect } from "../lib/api";

// Placeholder until Task 12: a centered pill that reports its rect so click-through can be checked.
export function Notch() {
  const pill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = pill.current?.getBoundingClientRect();
    if (r) void overlaySetHitRect({ x: r.x, y: r.y, w: r.width, h: r.height });
  }, []);
  return (
    <div data-view="notch" className="flex justify-center">
      <div
        ref={pill}
        className="flex h-8 w-60 items-center justify-center rounded-b-2xl bg-black text-xs text-white"
      >
        notch
      </div>
    </div>
  );
}
