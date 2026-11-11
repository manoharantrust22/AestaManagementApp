/**
 * Small ring buffer of recent console errors/warnings + uncaught errors, so a
 * bug report can carry "what went wrong in the browser" without the reporter
 * knowing anything about dev tools. Installed once per page load.
 */

export interface ConsoleEntry {
  level: "error" | "warn" | "uncaught" | "rejection";
  message: string;
  at: string;
}

const MAX = 30;
const buffer: ConsoleEntry[] = [];
let installed = false;

function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ")
    .slice(0, 500);
}

function push(level: ConsoleEntry["level"], message: string) {
  buffer.push({ level, message, at: new Date().toISOString() });
  if (buffer.length > MAX) buffer.shift();
}

export function installConsoleBuffer() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    push("error", stringify(args));
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    push("warn", stringify(args));
    origWarn(...args);
  };
  window.addEventListener("error", (e) => {
    push("uncaught", `${e.message}${e.filename ? ` @ ${e.filename}:${e.lineno}` : ""}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    push("rejection", stringify([e.reason]));
  });
}

export function getConsoleEntries(): ConsoleEntry[] {
  return [...buffer];
}
