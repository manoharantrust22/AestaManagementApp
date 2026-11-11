"use client";

/**
 * App-wide bug reporter.
 *  - Long-press (~800ms) on any element → viewport screenshot with that
 *    element pre-highlighted → annotate + voice/text → submit.
 *  - `window.dispatchEvent(new CustomEvent("aesta:report-bug"))` opens it
 *    without a highlighted element (profile-menu entry).
 * A report is a task (source = 'bug_report') assigned to the bug owner.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Backdrop, CircularProgress, Snackbar, Stack, Typography } from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { createClient } from "@/lib/supabase/client";
import { useCreateTask } from "@/hooks/queries/useTasks";
import { installConsoleBuffer, getConsoleEntries } from "@/lib/bug-report/consoleBuffer";
import {
  createLongPressDetector,
  describeElement,
  isLongPressTarget,
  pickHighlightElement,
} from "@/lib/bug-report/longPress";
import { captureViewport, canvasToBlob } from "@/lib/bug-report/captureScreenshot";
import BugAnnotateDialog, { type BugSubmitPayload } from "./BugAnnotateDialog";
import type { BugReportContext, PendingAttachment } from "@/types/task.types";

interface Captured {
  canvas: HTMLCanvasElement | null;
  highlight: { x: number; y: number; w: number; h: number } | null;
  context: BugReportContext;
}

const BUG_OWNER_EMAIL = process.env.NEXT_PUBLIC_BUG_REPORT_ASSIGNEE_EMAIL || "";

async function resolveBugOwner(fallbackUserId: string): Promise<string> {
  const supabase = createClient() as any;
  if (BUG_OWNER_EMAIL) {
    const { data } = await supabase.from("users").select("id").ilike("email", BUG_OWNER_EMAIL).maybeSingle();
    if (data?.id) return data.id;
  }
  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  return admins?.[0]?.id ?? fallbackUserId;
}

function titleFrom(p: BugSubmitPayload, pageTitle: string): string {
  const src = (p.voice?.transcription?.transcript_en || p.text || p.voice?.transcription?.transcript || "").trim();
  if (!src) return `Problem on ${pageTitle}`;
  const first = src.split(/(?<=[.!?])\s/)[0] ?? src;
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}

export default function BugReportProvider() {
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const pathname = usePathname();
  const createTask = useCreateTask();

  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const openRef = useRef(false);
  openRef.current = !!captured || capturing;

  useEffect(() => {
    installConsoleBuffer();
  }, []);

  const begin = useCallback(
    async (el: Element | null) => {
      if (openRef.current) return;
      setCapturing(true);
      setError(null);
      try {
        navigator.vibrate?.(30);
      } catch {
        /* not supported */
      }
      const target = pickHighlightElement(el);
      const rect = target?.getBoundingClientRect() ?? null;
      const { selector, text } = describeElement(el);
      // Let the backdrop paint, then capture without it (data-bug-ignore).
      await new Promise((r) => setTimeout(r, 30));
      const shot = await captureViewport();
      const ctx: BugReportContext = {
        url: window.location.href,
        route: pathname,
        site_id: selectedSite?.id ?? null,
        site_name: selectedSite?.name ?? null,
        viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
        user_agent: navigator.userAgent,
        app_version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        selector,
        element_text: text,
        element_rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
      };
      setCaptured({
        canvas: shot?.canvas ?? null,
        highlight:
          shot && rect
            ? { x: rect.x * shot.scale, y: rect.y * shot.scale, w: rect.width * shot.scale, h: rect.height * shot.scale }
            : null,
        context: ctx,
      });
      setCapturing(false);
    },
    [pathname, selectedSite?.id, selectedSite?.name]
  );

  // Long-press listeners (capture phase so app handlers can't swallow them).
  useEffect(() => {
    if (!userProfile?.id) return;
    const det = createLongPressDetector({
      delay: 800,
      moveTolerance: 10,
      shouldStart: (t) => !openRef.current && isLongPressTarget(t),
      onLongPress: (p) => {
        const sel = window.getSelection?.();
        if (sel && !sel.isCollapsed) sel.removeAllRanges();
        void begin(p.target instanceof Element ? p.target : null);
      },
    });
    const down = (e: PointerEvent) => det.down(e);
    const move = (e: PointerEvent) => det.move(e);
    const up = () => det.up();
    const scroll = () => det.cancel();
    const swallow = (e: Event) => {
      if (det.justFired()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    window.addEventListener("scroll", scroll, true);
    document.addEventListener("contextmenu", swallow, true);
    document.addEventListener("click", swallow, true);
    return () => {
      det.cancel();
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      window.removeEventListener("scroll", scroll, true);
      document.removeEventListener("contextmenu", swallow, true);
      document.removeEventListener("click", swallow, true);
    };
  }, [userProfile?.id, begin]);

  // Menu entry point.
  useEffect(() => {
    const open = () => {
      // wait for the menu to close so it's not in the screenshot
      setTimeout(() => void begin(null), 250);
    };
    window.addEventListener("aesta:report-bug", open);
    return () => window.removeEventListener("aesta:report-bug", open);
  }, [begin]);

  const submit = async (p: BugSubmitPayload) => {
    if (!captured || !userProfile?.id) return;
    setError(null);
    try {
      const attachments: PendingAttachment[] = [];
      if (p.annotated) {
        const blob = await canvasToBlob(p.annotated);
        if (blob) attachments.push({ kind: "screenshot", blob, mime: "image/jpeg" });
      }
      if (p.voice) attachments.push({ kind: "voice", blob: p.voice.blob, mime: p.voice.mime });

      const assignee = userProfile.role === "admin" ? userProfile.id : await resolveBugOwner(userProfile.id);
      await createTask.mutateAsync({
        title: titleFrom(p, document.title || captured.context.route || "this page"),
        description: p.text || null,
        assignee_id: assignee,
        site_id: captured.context.site_id ?? null,
        category: "app",
        priority: p.priority,
        size: "small",
        due_date: null,
        source: "bug_report",
        context: { ...captured.context, console_errors: getConsoleEntries() },
        transcript: p.voice?.transcription?.transcript || null,
        transcript_en: p.voice?.transcription?.transcript_en || null,
        attachments,
      });
      setCaptured(null);
      setToast("Thanks! Problem reported 🙏");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report");
    }
  };

  return (
    <>
      <Backdrop open={capturing} sx={{ zIndex: (t) => t.zIndex.modal + 1, color: "#fff" }} data-bug-ignore>
        <Stack alignItems="center" spacing={1}>
          <CircularProgress color="inherit" />
          <Typography variant="body2">Capturing screen…</Typography>
        </Stack>
      </Backdrop>
      <BugAnnotateDialog
        open={!!captured}
        screenshot={captured?.canvas ?? null}
        highlight={captured?.highlight ?? null}
        submitting={createTask.isPending}
        error={error}
        onClose={() => setCaptured(null)}
        onSubmit={submit}
      />
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
