import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { transcribeAudioBase64 } from "@/lib/ai/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // ~10 min of opus; inline audio limit is 20MB

/**
 * POST multipart/form-data { audio: Blob } → { transcript, language, transcript_en }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: "Voice transcription is not configured (GEMINI_API_KEY)" }, { status: 503 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("audio");
    if (f && typeof f !== "string") file = f;
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too long" }, { status: 413 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(await transcribeAudioBase64(buf.toString("base64"), file.type));
  } catch (err) {
    console.error("[transcribe] failed", err);
    return NextResponse.json({ error: "Could not transcribe the recording" }, { status: 502 });
  }
}
