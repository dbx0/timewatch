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
const MARGIN = 8;

export function Popover({ anchor, open, onClose, children, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return;
    const place = () => {
      if (!ref.current) return;
      const a = anchor.getBoundingClientRect();
      const w = ref.current.offsetWidth;
      const h = ref.current.offsetHeight;
      const roomBelow = window.innerHeight - a.bottom - MARGIN;
      const above = roomBelow < h + GAP && a.top - MARGIN > roomBelow;
      const top = above ? a.top - h - GAP : a.bottom + GAP;
      const left = Math.max(MARGIN, Math.min(a.left, window.innerWidth - w - MARGIN));
      setPos({ top, left, above });
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
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: pos ? 1 : 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            transformOrigin: pos?.above ? "bottom" : "top",
          }}
          className={`z-[200] rounded-xl border border-line bg-[#18181e] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.6)] ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
