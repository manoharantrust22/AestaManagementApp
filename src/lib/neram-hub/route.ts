import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HubError } from "./client";
import type { HubErrorBody } from "./types";

/**
 * Shared plumbing for the /api/neram/* routes.
 *
 * `as` is ALWAYS the signed-in person's users.id, found here on the server
 * (createClient → auth.getUser → users by auth_id). A route never reads an
 * `as` (or any person id meant as "me") from the browser.
 */

export const NOT_LINKED_MESSAGE = "Your account is not connected to tasks yet. Ask Hari.";

export interface HubCaller {
  /** Aesta users.id: what the hub calls externalId and `as`. */
  userId: string;
  role: string;
  name: string;
}

const noStore = { "Cache-Control": "no-store" };

export function hubJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export function hubErrorJson(body: HubErrorBody, status: number) {
  return NextResponse.json(body, { status, headers: noStore });
}

/** The signed-in Aesta user, or null. */
export async function getHubCaller(): Promise<HubCaller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, role, name, status")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return { userId: data.id as string, role: data.role as string, name: data.name as string };
}

/** Turns anything thrown into `{ error, code, field? }` with the right status. */
export function toHubErrorResponse(err: unknown, what: string) {
  if (err instanceof HubError) {
    const body = err.toBody();
    if (err.code === "not_linked") body.error = NOT_LINKED_MESSAGE;
    return hubErrorJson(body, err.status);
  }
  console.error(`[neram] ${what} failed:`, err instanceof Error ? err.message : err);
  return hubErrorJson({ error: "Something went wrong with tasks. Please try again.", code: "error" }, 500);
}

/** Runs a handler for the signed-in caller; 401 when nobody is signed in. */
export async function withHubCaller(
  what: string,
  handler: (caller: HubCaller) => Promise<Response>,
): Promise<Response> {
  try {
    const caller = await getHubCaller();
    if (!caller) {
      return hubErrorJson({ error: "Please sign in again.", code: "forbidden" }, 401);
    }
    return await handler(caller);
  } catch (err) {
    return toHubErrorResponse(err, what);
  }
}

/** Reads a JSON body, or answers 400. */
export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    const value = (await request.json()) as T;
    if (!value || typeof value !== "object") throw new Error("not an object");
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      response: hubErrorJson({ error: "The request body is not valid JSON.", code: "invalid" }, 400),
    };
  }
}

/**
 * The address of the Aesta page a task points at. The hub accepts only https
 * on Aesta's own registered address, so dev/preview origins are swapped for
 * the production origin (path and query are kept, including ?site=).
 */
export function canonicalPageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const origin = (process.env.AESTA_APP_ORIGIN || "https://app.aesta.co.in").replace(/\/+$/, "");
  try {
    const u = new URL(raw, origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${origin}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}
