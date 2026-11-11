import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { en } from "./en";
import { es } from "./es";
import { getT, setLang, tables, useLang, useT, type Lang } from "./index";
import { ptBR } from "./pt-BR";

/** Every leaf path with its kind (string, function, array length). */
function shape(o: unknown, path = ""): string[] {
  if (typeof o === "string") return [`${path}:string`];
  if (typeof o === "function") return [`${path}:fn${o.length}`];
  if (Array.isArray(o)) return [`${path}:array${o.length}`, ...o.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  return Object.entries(o as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
}

afterEach(() => act(() => setLang("pt-BR")));

describe("i18n tables", () => {
  it("en and es have exactly the pt-BR keys", () => {
    const base = shape(ptBR);
    expect(shape(en)).toEqual(base);
    expect(shape(es)).toEqual(base);
  });

  it("no string is left empty", () => {
    for (const table of [ptBR, en, es]) {
      const empty = shape(table).filter((p) => p.endsWith(":string")).map((p) => p.split(":")[0]);
      const get = (p: string) => p.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], table);
      expect(empty.filter((p) => (get(p) as string).trim() === "")).toEqual([]);
    }
  });

  it("translations differ from pt-BR where it matters", () => {
    expect(en.notch.pause).not.toBe(ptBR.notch.pause);
    expect(es.settings.nav.general).not.toBe(ptBR.settings.nav.general);
    expect(en.weekdaysShort[0]).toBe("Mon");
    expect(es.weekdaysShort[0]).toBe("Lun");
  });

  it("tables map the language codes", () => {
    expect(tables["pt-BR"]).toBe(ptBR);
    expect(tables.en).toBe(en);
    expect(tables.es).toBe(es);
  });
});

describe("language store", () => {
  it("defaults to pt-BR and switches", () => {
    expect(useLang.getState().lang).toBe("pt-BR");
    expect(getT()).toBe(ptBR);
    act(() => setLang("es"));
    expect(getT()).toBe(es);
    expect(document.documentElement.lang).toBe("es");
  });

  it("ignores unknown codes", () => {
    act(() => setLang("fr" as Lang));
    expect(useLang.getState().lang).toBe("pt-BR");
  });

  it("re-renders components on change", () => {
    function Probe() {
      return <span>{useT().notch.stop}</span>;
    }
    render(<Probe />);
    expect(screen.getByText(ptBR.notch.stop)).toBeTruthy();
    act(() => setLang("en"));
    expect(screen.getByText(en.notch.stop)).toBeTruthy();
    act(() => setLang("es"));
    expect(screen.getByText(es.notch.stop)).toBeTruthy();
  });
});

describe("no hardcoded visible text", () => {
  it("components take labels from the language tables", () => {
    const sources = import.meta.glob<string>(["../components/**/*.tsx", "../views/*.tsx", "!**/*.test.tsx"], {
      query: "?raw",
      import: "default",
      eager: true,
    });
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    // A quoted label attribute, or a JSX text node (`>Texto</`), with letters in it.
    const literal = /(aria-label|title|placeholder|alt)="[^"]*\p{L}{2,}[^"]*"|(?<![=-])>\s*\p{L}{2,}[^<{}()=;]*<\//u;
    const offenders = Object.entries(sources).flatMap(([f, text]) =>
      text
        .split("\n")
        .map((line, i) => [line, i] as const)
        .filter(([line]) => literal.test(line))
        .map(([line, i]) => `${f}:${i + 1}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
