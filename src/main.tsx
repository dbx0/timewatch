import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import { getLang, setLang } from "./i18n";
import { getLanguage, onLanguage } from "./lib/api";
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

// `?lang=` already set the first frame; the backend is the source of truth after that.
document.documentElement.lang = getLang();
void getLanguage().then(setLang, () => {});
void onLanguage(setLang);

const view = new URLSearchParams(location.search).get("view") ?? "";
const View = views[view] ?? Report;
// The overlay window is transparent; only the pill/panel is painted.
if (view === "notch") document.documentElement.classList.add("overlay");
// Borderless app windows are transparent too, so the frame's rounded corners show.
else document.documentElement.classList.add("framed");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <View />
  </React.StrictMode>,
);
