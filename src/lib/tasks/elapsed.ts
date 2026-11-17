/**
 * Elapsed time for a running task, counted on the hub's clock: the hub sends
 * `now` with the list, we remember how far the phone's clock is from it, and
 * count from there (the phone's own clock may be wrong).
 */
export function clockOffsetMs(serverNowIso: string, clientNowMs: number): number {
  const server = Date.parse(serverNowIso);
  return Number.isFinite(server) ? server - clientNowMs : 0;
}

export function elapsedMs(startedAtIso: string, clientNowMs: number, offsetMs: number): number {
  const start = Date.parse(startedAtIso);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, clientNowMs + offsetMs - start);
}

/** "4m", "1h 05m", "2d 3h". Under a minute is "<1m". */
export function formatElapsed(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${String(min % 60).padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** The same, said in words for a screen reader label ("1 hour 5 minutes"). */
export function spokenElapsed(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "less than a minute";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (h === 0) return part(m, "minute");
  if (h < 24) return m ? `${part(h, "hour")} ${part(m, "minute")}` : part(h, "hour");
  return `${part(Math.floor(h / 24), "day")} ${part(h % 24, "hour")}`;
}
