/**
 * Shapes what the browser sends to /api/neram/* into exactly what the hub
 * accepts, keeping only known fields. The hub checks the rules again; this is
 * so nothing unexpected (and never a person id meant as "me") is passed on.
 * Pure: no server imports, unit-tested.
 */
import type {
  HubAction,
  HubActionName,
  HubFileUpload,
  HubNewTask,
  HubPage,
  HubPriority,
  HubSize,
} from "./types";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; field: string };

const bad = (error: string, field: string): { ok: false; error: string; field: string } => ({
  ok: false,
  error,
  field,
});

const PRIORITIES: readonly HubPriority[] = ["low", "normal", "high"];
const SIZES: readonly HubSize[] = ["quick", "short", "half", "big"];
const ACTIONS: readonly HubActionName[] = [
  "start",
  "done",
  "ask_check",
  "take_back_check",
  "approve",
  "send_back",
  "waiting",
  "put_back",
  "cancel",
  "reassign",
  "edit",
  "still_on",
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

function personId(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v.trim()) ? v.trim() : null;
}

export function readPageInput(raw: unknown, canonicalUrl: (u: unknown) => string | null): HubPage | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const url = canonicalUrl(p.url);
  if (!url) return null;
  return {
    url,
    title: text(p.title, 200),
    siteId: text(p.siteId, 64),
    siteName: text(p.siteName, 200),
  };
}

export function readNewTask(raw: unknown, canonicalUrl: (u: unknown) => string | null): Checked<HubNewTask> {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = text(b.title, 200);
  if (!title) return bad("Add a short title.", "title");
  const out: HubNewTask = { title };
  const notes = text(b.notes, 4000);
  if (notes) out.notes = notes;
  if (b.owner !== undefined && b.owner !== null && b.owner !== "") {
    const owner = personId(b.owner);
    if (!owner) return bad("Pick the person.", "owner");
    out.owner = owner;
  }
  if (b.dueDate) {
    if (typeof b.dueDate !== "string" || !DATE_RE.test(b.dueDate)) return bad("The due date is not a date.", "dueDate");
    out.dueDate = b.dueDate;
  }
  if (b.dueTime) {
    if (typeof b.dueTime !== "string" || !TIME_RE.test(b.dueTime)) return bad("The due time is not a time.", "dueTime");
    out.dueTime = b.dueTime;
  }
  if (b.priority !== undefined) {
    if (!PRIORITIES.includes(b.priority as HubPriority)) return bad("Pick a priority.", "priority");
    out.priority = b.priority as HubPriority;
  }
  if (b.size !== undefined && b.size !== null) {
    if (!SIZES.includes(b.size as HubSize)) return bad("Pick a size.", "size");
    out.size = b.size as HubSize;
  }
  const page = readPageInput(b.page, canonicalUrl);
  if (page) out.page = page;
  return { ok: true, value: out };
}

export function readAction(raw: unknown): Checked<HubAction> {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const action = b.action as HubActionName;
  if (!ACTIONS.includes(action)) return bad("Say what to do.", "action");
  const note = text(b.note, 4000);
  switch (action) {
    case "start":
    case "take_back_check":
    case "approve":
    case "put_back":
    case "still_on":
      return { ok: true, value: { action } };
    case "done":
      return { ok: true, value: note ? { action, note } : { action } };
    case "ask_check": {
      const checker = personId(b.checker);
      if (!checker) return bad("Pick who should check it.", "checker");
      return { ok: true, value: note ? { action, checker, note } : { action, checker } };
    }
    case "send_back": {
      const reason = text(b.reason, 2000);
      if (!reason) return bad("Say what still needs doing.", "reason");
      return { ok: true, value: { action, reason } };
    }
    case "waiting": {
      const on = personId(b.on);
      const reason = text(b.reason, 2000);
      if (!on && !reason) return bad("Say who or what it is waiting on.", "reason");
      return { ok: true, value: { action, ...(on ? { on } : {}), ...(reason ? { reason } : {}) } };
    }
    case "cancel": {
      const reason = b.reason;
      if (reason !== "not_needed" && reason !== "mistake" && reason !== "other") {
        return bad("Say why: not needed, a mistake or other.", "reason");
      }
      return { ok: true, value: { action, reason } };
    }
    case "reassign": {
      const owner = personId(b.owner);
      if (!owner) return bad("Pick the person.", "owner");
      return { ok: true, value: { action, owner } };
    }
    case "edit": {
      const out: Extract<HubAction, { action: "edit" }> = { action };
      if (b.title !== undefined) {
        const t = text(b.title, 200);
        if (!t) return bad("Add a short title.", "title");
        out.title = t;
      }
      if (b.notes !== undefined) out.notes = text(b.notes, 4000);
      if (b.dueDate !== undefined) {
        if (b.dueDate !== null && (typeof b.dueDate !== "string" || !DATE_RE.test(b.dueDate))) {
          return bad("The due date is not a date.", "dueDate");
        }
        out.dueDate = (b.dueDate as string | null) ?? null;
      }
      if (b.dueTime !== undefined) {
        if (b.dueTime !== null && (typeof b.dueTime !== "string" || !TIME_RE.test(b.dueTime))) {
          return bad("The due time is not a time.", "dueTime");
        }
        out.dueTime = (b.dueTime as string | null) ?? null;
      }
      if (b.priority !== undefined) {
        if (!PRIORITIES.includes(b.priority as HubPriority)) return bad("Pick a priority.", "priority");
        out.priority = b.priority as HubPriority;
      }
      if (b.size !== undefined) {
        if (b.size !== null && !SIZES.includes(b.size as HubSize)) return bad("Pick a size.", "size");
        out.size = (b.size as HubSize | null) ?? null;
      }
      if (Object.keys(out).length === 1) return bad("Say what to change.", "action");
      return { ok: true, value: out };
    }
  }
}

export function readComment(raw: unknown): Checked<string> {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = text(b.text, 4000);
  if (!t) return bad("Write something first.", "text");
  return { ok: true, value: t };
}

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, "");
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

export function readFile(raw: unknown): Checked<HubFileUpload> {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = b.type as HubFileUpload["type"];
  if (!(PHOTO_TYPES as readonly string[]).includes(type)) return bad("Send a JPEG, PNG or WebP photo.", "type");
  const data = typeof b.data === "string" ? b.data.replace(/^data:[^,]*,/, "").replace(/\s/g, "") : "";
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return bad("The photo is missing.", "data");
  if (base64Bytes(data) > MAX_PHOTO_BYTES) return bad("The photo is larger than 3 MB.", "data");
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const name = (text(b.name, 120) ?? `photo.${ext}`).replace(/[^\w.\- ]+/g, "_");
  return { ok: true, value: { name, type, data } };
}
