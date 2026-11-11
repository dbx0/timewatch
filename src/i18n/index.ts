import { create } from "zustand";
import { en } from "./en";
import { es } from "./es";
import { ptBR } from "./pt-BR";
import type { Lang, Strings } from "./types";

export type { Lang, LanguagePref, Strings } from "./types";

export const tables: Record<Lang, Strings> = { "pt-BR": ptBR, en, es };
export const LANGS: Lang[] = ["pt-BR", "en", "es"];
/** Each language in its own name (not translated). */
export const LANGUAGE_NAMES: Record<Lang, string> = { "pt-BR": "Português", en: "English", es: "Español" };

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as string[]).includes(v);

/** Windows open with `?lang=` (the backend's resolved language) so the first frame is already right. */
function initialLang(): Lang {
  const q = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("lang");
  return isLang(q) ? q : "pt-BR";
}

interface LangState {
  lang: Lang;
}

export const useLang = create<LangState>(() => ({ lang: initialLang() }));

export function setLang(lang: Lang) {
  if (!isLang(lang)) return;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  useLang.setState({ lang });
}

/** The current table; re-renders the component when the language changes. */
export const useT = (): Strings => tables[useLang((s) => s.lang)];
/** The current table outside React (actions, formatters). */
export const getT = (): Strings => tables[useLang.getState().lang];
export const getLang = (): Lang => useLang.getState().lang;
