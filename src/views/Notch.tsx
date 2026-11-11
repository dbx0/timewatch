import { NotchApp } from "../components/notch/NotchApp";

// The overlay window is transparent (main.tsx adds `html.overlay`); only the pill/panel is painted.
export function Notch() {
  return <NotchApp />;
}
