import { frameName, host, plain } from "./host";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const r = await host().invoke(cmd, plain(args), frameName());
  return plain(r) as T;
}
