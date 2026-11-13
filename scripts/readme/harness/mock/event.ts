import { host, plain } from "./host";

export type UnlistenFn = () => void;
export interface Event<T> {
  event: string;
  id: number;
  payload: T;
}

export async function listen<T>(event: string, cb: (e: Event<T>) => void): Promise<UnlistenFn> {
  return host().listen(event, (e) => cb({ ...e, payload: plain(e.payload) as T }));
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  host().emit(event, payload);
}
