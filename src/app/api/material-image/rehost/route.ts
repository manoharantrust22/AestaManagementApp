/**
 * Re-host a web image into Supabase storage (Phase 4 — online product images).
 *
 * The browser can't reliably fetch arbitrary remote images (CORS, and many
 * CDNs are blocked on the app's Indian ISPs). So this route fetches the chosen
 * image SERVER-SIDE (Vercel can reach the CDN), uploads it to the existing
 * `work-updates/product-photos/` bucket via the service-role client, and
 * returns the stable Supabase public URL — which displays reliably through the
 * Cloudflare proxy like every other app image.
 *
 * Body: { imageUrl, materialId?, materialBrandId? }
 *   - materialId / materialBrandId: when set (catalog bulk-fill), the route
 *     also stamps `image_url` on that row. For ingest (material not created
 *     yet) omit them and let the commit flow set it from `productPhotoUrl`.
 *
 * Runtime: Node (default).
 */

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const BUCKET = "work-updates";
const FOLDER = "product-photos";

function extFromContentType(ct: string): string {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  return "jpg";
}

export async function POST(req: NextRequest) {
  let body: { imageUrl?: string; materialId?: string; materialBrandId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return NextResponse.json({ error: "A valid http(s) imageUrl is required" }, { status: 400 });
  }

  // Fetch the remote image server-side.
  let imgRes: Response;
  try {
    imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000), redirect: "follow" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    return NextResponse.json({ error: `Could not fetch image: ${msg}` }, { status: 502 });
  }
  if (!imgRes.ok) {
    return NextResponse.json({ error: `Image URL returned ${imgRes.status}` }, { status: 502 });
  }
  const contentType = (imgRes.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: `That URL isn't an image (${contentType || "unknown type"})` },
      { status: 415 },
    );
  }
  const arrayBuf = await imgRes.arrayBuffer();
  if (arrayBuf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 8MB)" }, { status: 413 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server not configured";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const ext = extFromContentType(contentType);
  const filePath = `${FOLDER}/rehost-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(filePath, Buffer.from(arrayBuf), { contentType, upsert: false });
  if (uploadErr) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(filePath);
  const publicUrl = pub.publicUrl;

  // Optionally stamp onto an existing catalog row (bulk-fill).
  if (body.materialId) {
    const { error } = await admin
      .from("materials")
      .update({ image_url: publicUrl })
      .eq("id", body.materialId);
    if (error) {
      return NextResponse.json(
        { publicUrl, warning: `Image saved but couldn't set material: ${error.message}` },
        { status: 200 },
      );
    }
  }
  if (body.materialBrandId) {
    await admin
      .from("material_brands")
      .update({ image_url: publicUrl })
      .eq("id", body.materialBrandId);
  }

  return NextResponse.json({ publicUrl });
}
