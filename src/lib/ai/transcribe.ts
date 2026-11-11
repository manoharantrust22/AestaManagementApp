import { GEMINI_MODEL, getGemini, normalizeAudioMime } from "./gemini";
import type { VoiceTranscription } from "@/types/task.types";

const PROMPT = `You are transcribing a short voice note from a construction company app in Tamil Nadu, India.
The speaker may use Tamil, English, or a Tamil-English mix (Tanglish).
Return JSON only:
- "transcript": exactly what was said, in the original language and script (Tamil words in Tamil script).
- "language": "ta", "en" or "mixed".
- "transcript_en": a clear, faithful English version (if already English, repeat it, lightly cleaned up).
Do not add anything that was not said. If the audio is silent or unintelligible, return empty strings.`;

/** Server-only: audio bytes → transcript (original + English). */
export async function transcribeAudioBase64(base64: string, mime: string): Promise<VoiceTranscription> {
  const ai = getGemini();
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPT }, { inlineData: { mimeType: normalizeAudioMime(mime), data: base64 } }],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          transcript: { type: "string" },
          language: { type: "string", enum: ["ta", "en", "mixed"] },
          transcript_en: { type: "string" },
        },
        required: ["transcript", "language", "transcript_en"],
      },
    },
  });
  const parsed = JSON.parse(res.text ?? "{}") as Partial<VoiceTranscription>;
  return {
    transcript: (parsed.transcript ?? "").trim(),
    language: parsed.language ?? "en",
    transcript_en: (parsed.transcript_en ?? "").trim(),
  };
}
