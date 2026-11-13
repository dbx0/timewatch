/** The native save panel is not part of the app's UI: answer like the user picked Documents. */
export async function save(opts?: { defaultPath?: string }): Promise<string | null> {
  await new Promise((r) => setTimeout(r, 250));
  return `/Users/demo/Documents/${opts?.defaultPath ?? "export"}`;
}
