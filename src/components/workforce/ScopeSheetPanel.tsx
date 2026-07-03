"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Collapse,
  IconButton,
  Button,
  TextField,
  Stack,
  InputAdornment,
} from "@mui/material";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Add from "@mui/icons-material/Add";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import { ReceiptCapture, type ReceiptCaptureValue } from "@/components/common/ReceiptCapture";
import { useAuth } from "@/contexts/AuthContext";
import {
  useSubcontractScopeSheet,
  useSaveSubcontractScopeSheet,
} from "@/hooks/queries/useSubcontractScopeSheet";
import { isMissingAfter, sumScopeValues, type ScopeItem } from "@/types/scopeSheet.types";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";

const newItem = (): ScopeItem => ({
  id: crypto.randomUUID(),
  label: "",
  note: "",
  before: null,
  after: null,
});

/**
 * "Scope & photos" — the agreed work list for a contract/section/task, each item with a
 * before photo (set up front) and a same-angle after photo (at completion). Lets the owner
 * pin down what's included so a labourer can't later claim it wasn't. Documentation only —
 * never touches money/attendance. One JSONB row per subcontract.
 */
export function ScopeSheetPanel({
  subcontractId,
  canEdit,
}: {
  subcontractId: string;
  canEdit: boolean;
}) {
  const { userProfile } = useAuth();
  const { data: serverItems } = useSubcontractScopeSheet(subcontractId);
  const save = useSaveSubcontractScopeSheet();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ScopeItem[]>([]);
  const seeded = useRef(false);

  // Re-seed when the contract changes; take the server copy once, then own it locally.
  useEffect(() => {
    seeded.current = false;
    setItems([]);
  }, [subcontractId]);
  useEffect(() => {
    if (!seeded.current && serverItems) {
      setItems(serverItems);
      seeded.current = true;
    }
  }, [serverItems]);

  const persist = (next: ScopeItem[]) => {
    setItems(next);
    save.mutate({ subcontractId, items: next, userId: userProfile?.id });
  };
  const persistCurrent = () =>
    save.mutate({ subcontractId, items, userId: userProfile?.id });

  const setText = (id: string, field: "label" | "note", val: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: val } : i)));

  // Whole rupees only — the estimate per point, summed into the plan's value.
  const setValue = (id: string, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    const num = digits ? Number(digits) : undefined;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, value: num } : i)));
  };

  const setPhoto = (id: string, which: "before" | "after", v: ReceiptCaptureValue | null) =>
    persist(
      items.map((i) =>
        i.id === id
          ? { ...i, [which]: v ? { ...v, capturedAt: new Date().toISOString() } : null }
          : i
      )
    );

  const missingAfter = items.filter(isMissingAfter).length;
  const plannedTotal = sumScopeValues(items);
  const headerSub =
    items.length === 0
      ? "agree the works + before photos"
      : `${items.length} work${items.length === 1 ? "" : "s"}${
          plannedTotal > 0 ? ` · ₹${plannedTotal.toLocaleString("en-IN")}` : ""
        }${missingAfter > 0 ? ` · ${missingAfter} need ‘after’` : ""}`;

  return (
    <Box
      sx={{
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.card}px`,
        bgcolor: wsColors.surface,
        overflow: "hidden",
      }}
    >
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 1.25,
          cursor: "pointer",
          "&:hover": { bgcolor: wsColors.canvas },
        }}
      >
        <PhotoCameraOutlined sx={{ fontSize: 18, color: wsColors.muted }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: wsColors.ink }}>
            Scope &amp; photos
          </Typography>
          <Typography
            sx={{ fontSize: 11, color: missingAfter > 0 ? wsColors.amber : wsColors.muted }}
            noWrap
          >
            {headerSub}
          </Typography>
        </Box>
        <ChevronRight
          sx={{
            fontSize: 20,
            color: wsColors.muted,
            transition: "transform .18s",
            transform: open ? "rotate(90deg)" : "none",
          }}
        />
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
          <Typography sx={{ fontSize: 11, color: wsColors.muted }}>
            List the works you agreed, with a <strong>before</strong> photo and an estimated{" "}
            <strong>₹ value</strong> each. Take the <strong>same-angle</strong> photo when each is
            done — your proof of what was included.
          </Typography>

          {items.length === 0 && !canEdit && (
            <Typography sx={{ fontSize: 12, color: wsColors.muted, fontStyle: "italic" }}>
              No works listed.
            </Typography>
          )}

          {items.map((it, idx) => (
            <Box
              key={it.id}
              sx={{
                border: `1px solid ${wsColors.hairline2}`,
                borderRadius: `${wsRadius.input}px`,
                p: 1.25,
              }}
            >
              <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: wsColors.muted, mt: 1 }}>
                  {idx + 1}.
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {canEdit ? (
                    <>
                      <Stack direction="row" spacing={1} alignItems="flex-end">
                        <TextField
                          value={it.label}
                          onChange={(e) => setText(it.id, "label", e.target.value)}
                          onBlur={persistCurrent}
                          placeholder="Work to be done (e.g. Wall plastering — 2 coats)"
                          size="small"
                          fullWidth
                          variant="standard"
                          sx={{ flex: 1, minWidth: 0 }}
                        />
                        <TextField
                          value={it.value ?? ""}
                          onChange={(e) => setValue(it.id, e.target.value)}
                          onBlur={persistCurrent}
                          placeholder="0"
                          size="small"
                          variant="standard"
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">₹</InputAdornment>
                            ),
                          }}
                          inputProps={{ inputMode: "numeric", "aria-label": "Estimated value" }}
                          sx={{ width: 96, flexShrink: 0 }}
                        />
                      </Stack>
                      <TextField
                        value={it.note ?? ""}
                        onChange={(e) => setText(it.id, "note", e.target.value)}
                        onBlur={persistCurrent}
                        placeholder="Note (optional)"
                        size="small"
                        fullWidth
                        variant="standard"
                        sx={{ mt: 0.5 }}
                      />
                    </>
                  ) : (
                    <>
                      <Stack direction="row" spacing={1} alignItems="baseline">
                        <Typography
                          sx={{ fontSize: 13, fontWeight: 700, color: wsColors.ink, flex: 1, minWidth: 0 }}
                        >
                          {it.label || "(untitled work)"}
                        </Typography>
                        {typeof it.value === "number" && it.value > 0 && (
                          <Typography
                            sx={{ fontSize: 12.5, fontWeight: 800, color: wsColors.ink, flexShrink: 0 }}
                          >
                            ₹{it.value.toLocaleString("en-IN")}
                          </Typography>
                        )}
                      </Stack>
                      {it.note && (
                        <Typography sx={{ fontSize: 11.5, color: wsColors.muted }}>{it.note}</Typography>
                      )}
                    </>
                  )}
                </Box>
                {canEdit && (
                  <IconButton
                    size="small"
                    onClick={() => persist(items.filter((x) => x.id !== it.id))}
                    aria-label="Remove work item"
                  >
                    <DeleteOutline sx={{ fontSize: 18, color: wsColors.muted }} />
                  </IconButton>
                )}
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mt: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReceiptCapture
                    label="Before"
                    value={it.before}
                    onChange={(v) => setPhoto(it.id, "before", v)}
                    folder={`subcontract/${subcontractId}/scope`}
                    disabled={!canEdit}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReceiptCapture
                    label="After (same angle)"
                    value={it.after}
                    onChange={(v) => setPhoto(it.id, "after", v)}
                    folder={`subcontract/${subcontractId}/scope`}
                    disabled={!canEdit}
                  />
                  {it.before && !it.after && (
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
                      <Box
                        component="img"
                        src={it.before.url}
                        alt="before"
                        sx={{
                          width: 28,
                          height: 28,
                          objectFit: "cover",
                          borderRadius: 0.5,
                          border: `1px solid ${wsColors.hairline}`,
                        }}
                      />
                      <Typography sx={{ fontSize: 10.5, color: wsColors.muted }}>
                        Match this angle
                      </Typography>
                    </Stack>
                  )}
                </Box>
              </Stack>
            </Box>
          ))}

          {canEdit && (
            <Button
              size="small"
              startIcon={<Add sx={{ fontSize: 16 }} />}
              onClick={() => persist([...items, newItem()])}
              sx={{
                alignSelf: "flex-start",
                textTransform: "none",
                color: wsColors.primary,
                fontWeight: 700,
              }}
            >
              Add work item
            </Button>
          )}

          {plannedTotal > 0 && (
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              sx={{ borderTop: `1px solid ${wsColors.hairline}`, pt: 1 }}
            >
              <Typography sx={{ fontSize: 11.5, color: wsColors.muted, fontWeight: 700 }}>
                Planned total ({items.length} point{items.length === 1 ? "" : "s"})
              </Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 800, color: wsColors.ink }}>
                ₹{plannedTotal.toLocaleString("en-IN")}
              </Typography>
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
