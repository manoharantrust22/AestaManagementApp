/**
 * Extract a JSON object from text the user pasted from ChatGPT or Gemini.
 *
 * Tolerance order (each step is tried in turn):
 *   1. Fenced code block:  ```json { ... } ```  or  ``` { ... } ```
 *   2. Raw paste:          { ... }  with no surrounding prose
 *   3. Loose:              "Here's your data: { ... } let me know if you need more"
 *                          → strip everything before the first balanced top-level
 *                            { and after its matching }.
 *
 * Returns the parsed value plus a `source` field naming which tolerance step
 * succeeded — useful for showing a "We tolerated extra prose; verify result"
 * banner in the UI.
 */

export type ExtractJsonResult =
  | { ok: true; value: unknown; source: "fenced" | "raw" | "loose" }
  | { ok: false; error: string };

const FENCED_RE =
  /```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n?```/m;

export function extractJson(input: string): ExtractJsonResult {
  if (typeof input !== "string") {
    return { ok: false, error: "Expected a string to parse" };
  }
  const trimmed = stripBom(input).trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Pasted content is empty" };
  }

  // 1. Fenced code block
  const fenced = trimmed.match(FENCED_RE);
  if (fenced) {
    const fenceBody = fenced[1].trim();
    const parsed = tryParse(fenceBody);
    if (parsed.ok) return { ok: true, value: parsed.value, source: "fenced" };
  }

  // 2. Raw JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = tryParse(trimmed);
    if (parsed.ok) return { ok: true, value: parsed.value, source: "raw" };
  }

  // 3. Loose: find first balanced top-level object/array
  const looseSlice = sliceBalancedJson(trimmed);
  if (looseSlice) {
    const parsed = tryParse(looseSlice);
    if (parsed.ok) return { ok: true, value: parsed.value, source: "loose" };
    return { ok: false, error: parsed.error };
  }

  return {
    ok: false,
    error:
      "No valid JSON found. Paste the AI's response — including the ```json code block if present.",
  };
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Find the substring of `text` corresponding to the first balanced top-level
 * JSON object or array. Walks `{...}` / `[...]` while respecting strings and
 * escapes. Returns null if no balanced top-level value is found.
 */
function sliceBalancedJson(text: string): string | null {
  const startIdx = findFirstStructuralOpener(text);
  if (startIdx === -1) return null;

  const opener = text[startIdx];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  return null;
}

function findFirstStructuralOpener(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") return i;
  }
  return -1;
}
