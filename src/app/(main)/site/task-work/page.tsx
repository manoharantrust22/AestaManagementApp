import { redirect } from "next/navigation";

/**
 * Workforce Ship 2b: the standalone Task Work page is retired. Fixed-price
 * packages now live in the Workforce home (/site/trades) — listed per trade
 * with their full detail drawer, and created via "Add Task Work". This redirect
 * keeps old links/bookmarks working.
 */
export default function SiteTaskWorkPage() {
  redirect("/site/trades");
}
