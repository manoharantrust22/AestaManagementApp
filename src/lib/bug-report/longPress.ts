/**
 * Framework-free long-press detector. Feed it pointer + scroll events; it
 * calls `onLongPress` once the pointer has stayed (within `moveTolerance`) for
 * `delay` ms. Movement, release, cancel or scroll before that aborts.
 */

export interface LongPressPoint {
  x: number;
  y: number;
  target: EventTarget | null;
}

export interface LongPressOptions {
  delay?: number;
  moveTolerance?: number;
  onLongPress: (p: LongPressPoint) => void;
  /** Return false to ignore a press (e.g. on inputs). */
  shouldStart?: (target: EventTarget | null) => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface LongPressDetector {
  down: (e: { clientX: number; clientY: number; target: EventTarget | null; button?: number; isPrimary?: boolean }) => void;
  move: (e: { clientX: number; clientY: number }) => void;
  up: () => void;
  cancel: () => void;
  /** True for a short window after a long-press fired (to swallow the click / context menu). */
  justFired: () => boolean;
}

export function createLongPressDetector(opts: LongPressOptions): LongPressDetector {
  const delay = opts.delay ?? 800;
  const tol = opts.moveTolerance ?? 10;
  const setT = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = opts.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));

  let timer: unknown = null;
  let start: LongPressPoint | null = null;
  let firedAt = 0;

  const cancel = () => {
    if (timer !== null) clearT(timer);
    timer = null;
    start = null;
  };

  return {
    down(e) {
      cancel();
      if (e.button !== undefined && e.button !== 0) return;
      if (e.isPrimary === false) return;
      if (opts.shouldStart && !opts.shouldStart(e.target)) return;
      start = { x: e.clientX, y: e.clientY, target: e.target };
      timer = setT(() => {
        const p = start;
        timer = null;
        start = null;
        if (p) {
          firedAt = Date.now();
          opts.onLongPress(p);
        }
      }, delay);
    },
    move(e) {
      if (!start) return;
      if (Math.abs(e.clientX - start.x) > tol || Math.abs(e.clientY - start.y) > tol) cancel();
    },
    up: cancel,
    cancel,
    justFired: () => Date.now() - firedAt < 700,
  };
}

const IGNORE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "audio",
  "video",
  "canvas",
  "[contenteditable='true']",
  "[data-no-bug-longpress]",
].join(",");

export function isLongPressTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !target.closest(IGNORE_SELECTOR);
}

/** Short, stable-ish CSS path for a clicked element, for the bug brief. */
export function describeElement(el: Element | null): { selector: string | null; text: string | null } {
  if (!el) return { selector: null, text: null };
  const parts: string[] = [];
  let node: Element | null = el;
  for (let depth = 0; node && depth < 5 && node !== document.body; depth++) {
    if (node.id && !/^:r|^mui-|^\d/.test(node.id)) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const testId = node.getAttribute("data-testid");
    let part = node.tagName.toLowerCase();
    if (testId) {
      part += `[data-testid="${testId}"]`;
    } else {
      const cls = [...node.classList].filter((c) => !/^css-|^Mui.*-(root|focusVisible)$/.test(c) && !/^jss/.test(c)).slice(0, 2);
      if (cls.length) part += `.${cls.join(".")}`;
    }
    parts.unshift(part);
    if (testId) break;
    node = node.parentElement;
  }
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? "";
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 80) || null;
  return { selector: parts.join(" > ") || null, text };
}

/** Pick the "card-ish" ancestor to highlight rather than a tiny span. */
export function pickHighlightElement(el: Element | null): Element | null {
  let node = el;
  while (node && node !== document.body) {
    const r = node.getBoundingClientRect();
    if (r.width >= 60 && r.height >= 28) return node;
    node = node.parentElement;
  }
  return el;
}
