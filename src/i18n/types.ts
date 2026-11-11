import type { ptBR } from "./pt-BR";

/** The shape of `ptBR` with literal strings widened, so other languages must have the same keys. */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T;

export type Strings = Widen<typeof ptBR>;
export type Lang = "pt-BR" | "en" | "es";
/** `Settings.language`: `system` follows the OS locale (resolved by the backend). */
export type LanguagePref = "system" | Lang;
