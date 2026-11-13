// Every app window (iframe) talks to the one fake backend living in the desktop page, like Tauri
// windows talk to the one Rust process.
export interface Host {
  invoke(cmd: string, args: Record<string, unknown> | undefined, frame: string): Promise<unknown>;
  listen(event: string, cb: (e: { event: string; id: number; payload: unknown }) => void): () => void;
  emit(event: string, payload?: unknown): void;
  writeClipboard(text: string): void;
  windowAction(frame: string, action: string): void;
}

export const frameName = () => new URLSearchParams(location.search).get("view") ?? "report";

export function host(): Host {
  const h = (window.top as unknown as { __tw?: Host }).__tw;
  if (!h) throw new Error("demo host missing");
  return h;
}

/** Results cross the frame boundary as plain data (never shared, mutable backend objects). */
export const plain = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
