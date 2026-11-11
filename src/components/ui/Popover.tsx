import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

const GAP = 6;
/** Minimum distance to the window edges (the window has rounded corners). */
const MARGIN = 8;

export interface Placement {
  top: number;
  left: number;
  above: boolean;
  /** Set when the content is taller than the room on either side: it scrolls. */
  maxHeight?: number;
  maxWidth?: number;
}

/**
 * Keeps a popover inside the viewport: below the anchor when it fits, else above, else on
 * the larger side with its height capped to that room; always `MARGIN` px from the edges.
 */
export function placePopover(
  a: { top: number; bottom: number; left: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
): Placement {
  const below = view.h - a.bottom - GAP - MARGIN;
  const aboveRoom = a.top - GAP - MARGIN;
  let above = false;
  let maxHeight: number | undefined;
  if (size.h > below) {
    if (size.h <= aboveRoom) above = true;
    else {
      above = aboveRoom > below;
      maxHeight = Math.max(0, above ? aboveRoom : below);
    }
  }
  const h = maxHeight ?? size.h;
  let top = above ? a.top - GAP - h : a.bottom + GAP;
  top = Math.max(MARGIN, Math.min(top, view.h - MARGIN - h));
  const room = Math.max(0, view.w - 2 * MARGIN);
  const w = Math.min(size.w, room);
  const left = Math.max(MARGIN, Math.min(a.left, view.w - w - MARGIN));
  return { top, left, above, maxHeight, maxWidth: size.w > room ? room : undefined };
}

export function Popover({ anchor, open, onClose, children, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return;
    const place = () => {
      const el = ref.current;
      if (!el) return;
      // Natural size even when a previous placement capped it (scrollHeight + borders).
      const h = el.scrollHeight + (el.offsetHeight - el.clientHeight);
      setPos(
        placePopover(anchor.getBoundingClientRect(), { w: el.offsetWidth, h }, {
          w: window.innerWidth,
          h: window.innerHeight,
        }),
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const onDown = (e: PointerEvent | MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="presentation"
          initial={{ opacity: 0, y: pos?.above ? 4 : -4, scale: 0.98 }}
          animate={{ opacity: pos ? 1 : 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: pos?.above ? 4 : -4, scale: 0.98 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            transformOrigin: pos?.above ? "bottom" : "top",
            maxHeight: pos?.maxHeight,
            maxWidth: pos?.maxWidth,
            overflowY: pos?.maxHeight !== undefined ? "auto" : undefined,
          }}
          className={`z-[200] rounded-xl border border-line bg-[#18181e] p-1.5 shadow-[0_10px_32px_rgba(0,0,0,.45)] ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
