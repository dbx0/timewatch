import { describe, expect, it } from "vitest";
import { tables } from "../i18n";
import { clientKey, clientLabel, isNoClient, sortedClients } from "./client";

describe("client helpers", () => {
  it("treats blank and the legacy labels as no client", () => {
    for (const c of ["", "  ", "Sem cliente", "No client", "Sin cliente"]) expect(isNoClient(c)).toBe(true);
    expect(isNoClient("Acme")).toBe(false);
    expect(clientKey("No client")).toBe("");
    expect(clientKey("Acme")).toBe("Acme");
  });

  it("labels no client in the given language", () => {
    expect(clientLabel("", tables.en)).toBe("No client");
    expect(clientLabel("Sem cliente", tables.es)).toBe("Sin cliente");
    expect(clientLabel("Acme", tables.en)).toBe("Acme");
  });

  it("sorts distinct clients in the language, no client last as one group", () => {
    expect(sortedClients(["globex", "", "Sem cliente", "Ábaco", "Acme", "Acme"], "pt-BR")).toEqual([
      "Ábaco",
      "Acme",
      "globex",
      "",
    ]);
  });
});
