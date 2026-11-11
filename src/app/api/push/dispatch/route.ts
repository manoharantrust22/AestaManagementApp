import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebPush, isPushConfigured, type PushPayload } from "@/lib/push/webPush";

export const runtime = "nodejs";
export const maxDuration = 30;

function secretOk(given: string | null): boolean {
  const expected = process.env.PUSH_DISPATCH_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the DB trigger notif_push_dispatch (pg_net) with
 * { notification_id }. Looks up the row + the recipient's devices and sends.
 */
export async function POST(request: NextRequest) {
  if (!secretOk(request.headers.get("x-push-secret"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ skipped: "vapid not configured" });
  }

  const { notification_id } = (await request.json().catch(() => ({}))) as { notification_id?: string };
  if (!notification_id) return NextResponse.json({ error: "notification_id required" }, { status: 400 });

  const admin = createAdminClient() as any;
  const { data: n } = await admin
    .from("notifications")
    .select("id, user_id, title, message, action_url, needs_action, notification_type, related_id")
    .eq("id", notification_id)
    .maybeSingle();
  if (!n?.user_id) return NextResponse.json({ skipped: "not found" });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", n.user_id);
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const payload: PushPayload = {
    title: n.title,
    body: n.message,
    url: n.action_url || "/site/dashboard",
    // One live notification per entity+type on the device; newer replaces older.
    tag: n.related_id ? `${n.notification_type}:${n.related_id}` : undefined,
    needsAction: !!n.needs_action,
  };
  const body = JSON.stringify(payload);
  const webpush = getWebPush();

  let sent = 0;
  const dead: string[] = [];
  const used: string[] = [];
  await Promise.all(
    subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: n.needs_action ? "high" : "normal" }
        );
        sent++;
        used.push(s.id);
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
        else console.warn("[push/dispatch] send failed", code, err?.body || err?.message);
      }
    })
  );

  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  if (used.length) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", used);

  return NextResponse.json({ sent, removed: dead.length });
}
