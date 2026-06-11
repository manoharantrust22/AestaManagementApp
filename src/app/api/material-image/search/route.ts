/**
 * Image search for the "Find image online" picker (Phase 4 — online product
 * images). Returns candidate image URLs for a "{brand} {name}" query so the
 * user can tap one instead of capturing a photo. The picked URL is then
 * re-hosted into Supabase by /api/material-image/rehost.
 *
 * Provider is whichever key is configured (set ONE in .env.local / Vercel env):
 *   - Brave Search   → BRAVE_SEARCH_API_KEY            (simplest: one key)
 *   - Google CSE     → GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID
 * If neither is set, returns { configured: false } so the picker falls back to
 * its paste-a-URL field (no crash, no key required to use re-hosting).
 *
 * Runtime: Node (default). Keys stay server-side — never sent to the browser.
 */

import { NextRequest, NextResponse } from "next/server";

interface ImageResult {
  url: string; // full-size image URL (what we re-host)
  thumbnail: string; // small preview URL for the grid
  title: string;
}

function pickStr(...vals: any[]): string {
  for (const v of vals) if (typeof v === "string" && v) return v;
  return "";
}

async function searchBrave(query: string, key: string): Promise<ImageResult[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(
      query,
    )}&count=9&safesearch=strict`,
    {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) throw new Error(`Brave image search failed (${res.status})`);
  const data = await res.json();
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  return results
    .map((r) => ({
      url: pickStr(r?.properties?.url, r?.thumbnail?.src),
      thumbnail: pickStr(r?.thumbnail?.src, r?.properties?.url),
      title: pickStr(r?.title),
    }))
    .filter((r) => r.url);
}

async function searchGoogleCse(query: string, key: string, cx: string): Promise<ImageResult[]> {
  const res = await fetch(
    `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=9&safe=active&q=${encodeURIComponent(
      query,
    )}`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) throw new Error(`Google image search failed (${res.status})`);
  const data = await res.json();
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  return items
    .map((it) => ({
      url: pickStr(it?.link),
      thumbnail: pickStr(it?.image?.thumbnailLink, it?.link),
      title: pickStr(it?.title),
    }))
    .filter((r) => r.url);
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ configured: true, results: [] });

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  const googleKey = process.env.GOOGLE_CSE_API_KEY;
  const googleCx = process.env.GOOGLE_CSE_ID;

  try {
    if (braveKey) {
      return NextResponse.json({
        configured: true,
        provider: "brave",
        results: await searchBrave(query, braveKey),
      });
    }
    if (googleKey && googleCx) {
      return NextResponse.json({
        configured: true,
        provider: "google",
        results: await searchGoogleCse(query, googleKey, googleCx),
      });
    }
    // No provider configured — the picker shows its paste-a-URL fallback.
    return NextResponse.json({ configured: false, results: [] });
  } catch (err) {
    // Upstream provider failed (e.g. API not enabled, rate-limited, timeout).
    // Return 200 with the error in the body — the picker reads `error` and shows
    // it inline + falls back to paste-a-URL. A non-2xx here would only surface a
    // noisy browser console error for a case the UI already handles cleanly.
    const error = err instanceof Error ? err.message : "Image search failed";
    return NextResponse.json({ configured: true, results: [], error });
  }
}
