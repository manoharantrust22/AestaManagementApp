import { GoogleGenAI } from "@google/genai";

/**
 * Server-only Gemini client (import only from route handlers / server code). Key lives in GEMINI_API_KEY (Vercel env +
 * .env.cloud.local) — never NEXT_PUBLIC_.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/** Browsers send e.g. "audio/webm;codecs=opus" — Gemini wants the bare type. */
export function normalizeAudioMime(mime: string | null | undefined): string {
  const base = (mime || "audio/webm").split(";")[0].trim().toLowerCase();
  if (base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  return base;
}
