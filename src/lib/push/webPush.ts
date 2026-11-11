import webpush from "web-push";

/** Server-only. VAPID keys: `npx web-push generate-vapid-keys`. */
let configured = false;

export function isPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getWebPush() {
  if (!configured) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) throw new Error("VAPID keys are not configured");
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@aestabuilders.com", pub, priv);
    configured = true;
  }
  return webpush;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  needsAction?: boolean;
}
