"use client";

/**
 * Browser calls to Aesta's own /api/neram/* routes. The browser never calls
 * the hub and never sees the secret; the server adds who is asking.
 */
import type {
  HubAction,
  HubErrorBody,
  HubErrorCode,
  HubFileUpload,
  HubNewTask,
  HubPerson,
  HubRunning,
  HubState,
  HubTask,
  HubTaskDetail,
  HubView,
} from "./types";

export class NeramTaskError extends Error {
  readonly code: HubErrorCode;
  readonly field?: string;
  readonly status: number;
  constructor(status: number, body: Partial<HubErrorBody>) {
    super(body.error || "Something went wrong with tasks. Please try again.");
    this.name = "NeramTaskError";
    this.status = status;
    this.code = (body.code as HubErrorCode) || "error";
    this.field = body.field;
  }
}

export function isNotLinked(err: unknown): boolean {
  return err instanceof NeramTaskError && err.code === "not_linked";
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new NeramTaskError(0, {
      error: "Could not reach Aesta. Check the connection and try again.",
      code: "unreachable",
    });
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new NeramTaskError(res.status, (json ?? {}) as Partial<HubErrorBody>);
  return json as T;
}

const enc = encodeURIComponent;

export const neramApi = {
  people: () => call<{ people: Array<HubPerson & { role: string | null }> }>("GET", "/api/neram/people"),
  tasks: (view: HubView, state: HubState) =>
    call<{ tasks: HubTask[] }>("GET", `/api/neram/tasks?view=${view}&state=${state}`),
  task: (id: string) => call<{ task: HubTaskDetail }>("GET", `/api/neram/tasks/${enc(id)}`),
  create: (task: HubNewTask) => call<{ task: HubTaskDetail }>("POST", "/api/neram/tasks", task),
  action: (id: string, action: HubAction) =>
    call<{ task: HubTaskDetail }>("POST", `/api/neram/tasks/${enc(id)}/actions`, action),
  comment: (id: string, text: string) =>
    call<{ task: HubTaskDetail }>("POST", `/api/neram/tasks/${enc(id)}/comments`, { text }),
  file: (id: string, file: HubFileUpload) =>
    call<{ task: HubTaskDetail }>("POST", `/api/neram/tasks/${enc(id)}/files`, file),
  running: () => call<HubRunning>("GET", "/api/neram/running"),
  syncEvents: () => call<{ stored: number; cursor: number; skipped: boolean }>("POST", "/api/neram/events/sync"),
};
