"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import GestureIcon from "@mui/icons-material/Gesture";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import VoiceRecorder, { type VoiceRecording } from "@/components/common/VoiceRecorder";
import type { TaskPriority } from "@/types/task.types";

type Shape =
  | { type: "box"; x: number; y: number; w: number; h: number }
  | { type: "pen"; pts: Array<[number, number]> };

export interface BugSubmitPayload {
  annotated: HTMLCanvasElement | null;
  voice: VoiceRecording | null;
  text: string;
  priority: TaskPriority;
}

interface BugAnnotateDialogProps {
  open: boolean;
  screenshot: HTMLCanvasElement | null;
  /** Pre-highlight in screenshot pixel coords. */
  highlight: { x: number; y: number; w: number; h: number } | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (p: BugSubmitPayload) => void;
}

const RED = "#e53935";

export default function BugAnnotateDialog({
  open,
  screenshot,
  highlight,
  submitting,
  error,
  onClose,
  onSubmit,
}: BugAnnotateDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const drawingRef = useRef<Shape | null>(null);
  const [tool, setTool] = useState<"pen" | "box">("box");
  const [voice, setVoice] = useState<VoiceRecording | null>(null);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setShapes(highlight ? [{ type: "box", ...pad(highlight, screenshot) }] : []);
    setVoice(null);
    setText("");
    setPriority("medium");
    setLocalError(null);
  }, [open, highlight, screenshot]);

  const lineWidth = screenshot ? Math.max(3, Math.round(screenshot.width / 220)) : 4;

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !screenshot) return;
    if (c.width !== screenshot.width) c.width = screenshot.width;
    if (c.height !== screenshot.height) c.height = screenshot.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(screenshot, 0, 0);
    ctx.strokeStyle = RED;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const all = drawingRef.current ? [...shapes, drawingRef.current] : shapes;
    for (const s of all) {
      if (s.type === "box") {
        ctx.strokeRect(s.x, s.y, s.w, s.h);
      } else if (s.pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(s.pts[0][0], s.pts[0][1]);
        s.pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.stroke();
      }
    }
  }, [screenshot, shapes, lineWidth]);

  useEffect(() => {
    // canvas mounts after the dialog transition starts
    const id = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(id);
  }, [redraw, open]);

  const toImage = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toImage(e);
    drawingRef.current = tool === "box" ? { type: "box", x, y, w: 0, h: 0 } : { type: "pen", pts: [[x, y]] };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current;
    if (!d) return;
    const [x, y] = toImage(e);
    if (d.type === "box") {
      d.w = x - d.x;
      d.h = y - d.y;
    } else {
      d.pts.push([x, y]);
    }
    redraw();
  };
  const onUp = () => {
    const d = drawingRef.current;
    drawingRef.current = null;
    if (!d) return;
    if (d.type === "box") {
      if (Math.abs(d.w) < 8 || Math.abs(d.h) < 8) return redraw();
      const box = { type: "box" as const, x: Math.min(d.x, d.x + d.w), y: Math.min(d.y, d.y + d.h), w: Math.abs(d.w), h: Math.abs(d.h) };
      setShapes((s) => [...s, box]);
    } else if (d.pts.length > 1) {
      setShapes((s) => [...s, d]);
    } else {
      redraw();
    }
  };

  const submit = () => {
    setLocalError(null);
    if (!voice && !text.trim()) {
      setLocalError("Tell us what is wrong — speak or type");
      return;
    }
    onSubmit({ annotated: screenshot ? canvasRef.current : null, voice, text: text.trim(), priority });
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullScreen data-no-bug-longpress data-bug-ignore>
      <DialogTitle sx={{ display: "flex", alignItems: "center", py: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>Report a problem</Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={submitting}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 1.5 }}>
        <Stack spacing={1.5} sx={{ maxWidth: 720, mx: "auto" }}>
          {screenshot ? (
            <>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  Mark the problem area on the screenshot
                </Typography>
                <ToggleButtonGroup size="small" exclusive value={tool} onChange={(_, v) => v && setTool(v)}>
                  <ToggleButton value="box" aria-label="Box">
                    <CropSquareIcon fontSize="small" />
                  </ToggleButton>
                  <ToggleButton value="pen" aria-label="Pen">
                    <GestureIcon fontSize="small" />
                  </ToggleButton>
                </ToggleButtonGroup>
                <IconButton size="small" aria-label="Undo" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}>
                  <UndoIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden", lineHeight: 0, maxHeight: "55vh", overflowY: "auto" }}>
                <canvas
                  ref={canvasRef}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  style={{ width: "100%", touchAction: "none", cursor: "crosshair" }}
                />
              </Box>
            </>
          ) : (
            <Alert severity="info">Screenshot could not be captured — describe the problem below.</Alert>
          )}

          <VoiceRecorder value={voice} onChange={setVoice} label="Explain the problem (Tamil / English)" disabled={submitting} />
          <TextField
            size="small"
            label="Or type it (optional)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
              How urgent?
            </Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" value={priority} onChange={(_, v) => v && setPriority(v)}>
              <ToggleButton value="high" color="error">Blocking my work</ToggleButton>
              <ToggleButton value="medium" color="warning">Annoying</ToggleButton>
              <ToggleButton value="low">Small</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {(localError || error) && <Alert severity="error">{localError || error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.25, pb: "calc(10px + env(safe-area-inset-bottom))" }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={submitting} size="large">
          {submitting ? "Sending…" : "Send report"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function pad(r: { x: number; y: number; w: number; h: number }, c: HTMLCanvasElement | null) {
  const p = 6;
  const maxW = c?.width ?? Infinity;
  const maxH = c?.height ?? Infinity;
  const x = Math.max(0, r.x - p);
  const y = Math.max(0, r.y - p);
  return { x, y, w: Math.min(maxW - x, r.w + p * 2), h: Math.min(maxH - y, r.h + p * 2) };
}
