import { getLang, getT, type Lang, type Strings } from "../i18n";

/** Labels older versions stored as the client of projects without one (now saved as ""). */
const LEGACY_NO_CLIENT = new Set(["Sem cliente", "No client", "Sin cliente"]);

/** True for a project without a client: "" (or blank) and the legacy translated labels. */
export const isNoClient = (client: string): boolean => !client.trim() || LEGACY_NO_CLIENT.has(client.trim());

/** Grouping key: every flavor of "no client" collapses to "". */
export const clientKey = (client: string): string => (isNoClient(client) ? "" : client);

/** What to show for a client: the translated "no client" label when there is none. */
export const clientLabel = (client: string, t: Strings = getT()): string =>
  isNoClient(client) ? t.notch.noClient : client;

/** Distinct client keys, sorted in the UI language, the no-client group ("") last. */
export function sortedClients(clients: string[], lang: Lang = getLang()): string[] {
  const keys = [...new Set(clients.map(clientKey))];
  const collator = new Intl.Collator(lang);
  return keys.sort((a, b) => (a === "" ? 1 : b === "" ? -1 : collator.compare(a, b)));
}
