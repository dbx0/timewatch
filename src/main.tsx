import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import { Notch } from "./views/Notch";
import { Onboarding } from "./views/Onboarding";
import { Report } from "./views/Report";
import { Settings } from "./views/Settings";

const views: Record<string, () => React.JSX.Element> = {
  notch: Notch,
  report: Report,
  settings: Settings,
  onboarding: Onboarding,
};

const view = new URLSearchParams(location.search).get("view") ?? "";
const View = views[view] ?? Report;
// The overlay window is transparent; only the pill/panel is painted.
if (view === "notch") document.documentElement.classList.add("overlay");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <View />
  </React.StrictMode>,
);
