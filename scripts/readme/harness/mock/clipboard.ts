import { host } from "./host";

export async function writeText(text: string): Promise<void> {
  host().writeClipboard(text);
}
