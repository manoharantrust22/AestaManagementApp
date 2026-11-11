"use client";

/**
 * Tap-to-record voice note → Gemini transcription (Tamil / English / mixed).
 * Emits the audio blob (to store as an attachment) and the transcription.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, IconButton, Stack, Typography } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { VoiceTranscription } from "@/types/task.types";

export interface VoiceRecording {
  blob: Blob;
  mime: string;
  durationSec: number;
  transcription: VoiceTranscription | null;
}

interface VoiceRecorderProps {
  value: VoiceRecording | null;
  onChange: (rec: VoiceRecording | null) => void;
  /** Label for the idle button. */
  label?: string;
  /** Hard stop after N seconds. */
  maxSeconds?: number;
  disabled?: boolean;
  /** Skip the transcription call (just keep the audio). */
  skipTranscription?: boolean;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export async function transcribeAudio(blob: Blob, mime: string): Promise<VoiceTranscription> {
  const form = new FormData();
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
  form.append("audio", new File([blob], `voice.${ext}`, { type: mime }));
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Transcription failed");
  return json as VoiceTranscription;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoiceRecorder({
  value,
  onChange,
  label = "Speak (Tamil / English)",
  maxSeconds = 180,
  disabled,
  skipTranscription,
}: VoiceRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStream = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  useEffect(() => {
    if (!value?.blob) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(value.blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value?.blob]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording is not supported on this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const duration = (Date.now() - startedAtRef.current) / 1000;
        cleanupStream();
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0 || duration < 0.5) {
          setState("idle");
          return;
        }
        if (skipTranscription) {
          onChange({ blob, mime: type, durationSec: duration, transcription: null });
          setState("idle");
          return;
        }
        setState("transcribing");
        let transcription: VoiceTranscription | null = null;
        try {
          transcription = await transcribeAudio(blob, type);
        } catch (err) {
          setError(err instanceof Error ? `${err.message} — audio is still attached` : "Transcription failed");
        }
        onChange({ blob, mime: type, durationSec: duration, transcription });
        setState("idle");
      };
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      rec.start(1000);
      setState("recording");
      timerRef.current = setInterval(() => {
        const s = (Date.now() - startedAtRef.current) / 1000;
        setElapsed(s);
        if (s >= maxSeconds) stop();
      }, 250);
    } catch (err) {
      cleanupStream();
      const name = (err as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Microphone permission denied — allow it in the browser settings"
          : "Could not start the microphone"
      );
      setState("idle");
    }
  }, [cleanupStream, maxSeconds, onChange, skipTranscription, stop]);

  const t = value?.transcription;

  return (
    <Box>
      {state === "recording" ? (
        <Button
          fullWidth
          variant="contained"
          color="error"
          size="large"
          startIcon={<StopIcon />}
          onClick={stop}
          sx={{ py: 1.5, animation: "pulseRec 1.4s ease-in-out infinite", "@keyframes pulseRec": { "50%": { opacity: 0.75 } } }}
        >
          Stop · {fmt(elapsed)}
        </Button>
      ) : state === "transcribing" ? (
        <Button fullWidth variant="outlined" size="large" disabled startIcon={<CircularProgress size={18} />} sx={{ py: 1.5 }}>
          Understanding your voice…
        </Button>
      ) : value ? (
        <Stack spacing={1} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "action.hover" }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            {audioUrl && <audio src={audioUrl} controls style={{ flex: 1, height: 36, minWidth: 0 }} />}
            <IconButton aria-label="Delete recording" onClick={() => onChange(null)} disabled={disabled}>
              <DeleteOutlineIcon />
            </IconButton>
          </Stack>
          {t?.transcript && (
            <Box>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {t.transcript}
              </Typography>
              {t.language !== "en" && t.transcript_en && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                  EN: {t.transcript_en}
                </Typography>
              )}
            </Box>
          )}
          <Button size="small" startIcon={<MicIcon />} onClick={start} disabled={disabled} sx={{ alignSelf: "flex-start" }}>
            Record again
          </Button>
        </Stack>
      ) : (
        <Button
          fullWidth
          variant="outlined"
          size="large"
          startIcon={<MicIcon />}
          onClick={start}
          disabled={disabled}
          sx={{ py: 1.5, borderStyle: "dashed" }}
        >
          {label}
        </Button>
      )}
      {error && (
        <Typography variant="caption" color="error" component="div" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
