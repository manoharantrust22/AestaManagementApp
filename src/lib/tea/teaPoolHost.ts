export type TeaMode = "pool" | "own" | "off";

export interface TradeTea {
  id: string;
  name: string;
  teaMode: TeaMode;
  poolHost: string | null;
}

/** Resolved pool host for a trade (NULL -> company default). */
export function resolvePoolHost(t: TradeTea, defaultHost: string): string {
  if (t.teaMode === "own") return t.id;
  return t.poolHost ?? defaultHost;
}
