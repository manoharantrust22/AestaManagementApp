"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CapturedAudio {
  blob: Blob;
  mime: string;
  durationSec: number;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/** Minimal tap-to-start / tap-to-stop recorder. */
export function useVoiceCapture(onDone: (audio: CapturedAudio) => void, maxSeconds = 120) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    cancelled.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Voice is not supported on this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const dur = (Date.now() - startedAt.current) / 1000;
        cleanup();
        setRecording(false);
        if (cancelled.current || dur < 0.6) return;
        const type = rec.mimeType || mime || "audio/webm";
        doneRef.current({ blob: new Blob(chunks.current, { type }), mime: type, durationSec: dur });
      };
      recRef.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      rec.start(1000);
      setRecording(true);
      timer.current = setInterval(() => {
        const s = (Date.now() - startedAt.current) / 1000;
        setElapsed(s);
        if (s >= maxSeconds) stop();
      }, 250);
    } catch (err) {
      cleanup();
      setRecording(false);
      setError((err as DOMException)?.name === "NotAllowedError" ? "Allow microphone access to talk" : "Could not start the microphone");
    }
  }, [cleanup, maxSeconds, stop]);

  return { recording, elapsed, error, start, stop, cancel };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
