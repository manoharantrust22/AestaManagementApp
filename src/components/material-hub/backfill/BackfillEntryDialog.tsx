"use client";

/**
 * Method picker for the Historical Backfill flow. Two choices:
 *   - Manual entry (one record at a time, ~30 sec/row, best for 1–20 items)
 *   - AI-assisted ingest (3-step wizard, best for batches of 20+)
 *
 * Mirrors `BackfillMethodModal` in docs/Historical_Material_Backfill/proto-backfill.jsx.
 */

import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Box,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ReceiptIcon from "@mui/icons-material/Receipt";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";

export type BackfillMethod = "manual" | "ai";

export interface BackfillEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onChoose: (method: BackfillMethod) => void;
}

interface ChoiceSpec {
  method: BackfillMethod;
  icon: React.ReactNode;
  tone: HubTone;
  highlighted?: boolean;
  title: string;
  sub: string;
  tag: string;
  newPill?: boolean;
}

export default function BackfillEntryDialog({
  open,
  onClose,
  onChoose,
}: BackfillEntryDialogProps) {
  const choices: ChoiceSpec[] = [
    {
      method: "manual",
      icon: <ReceiptIcon />,
      tone: "primary",
      title: "Manual entry",
      sub: "One material at a time. Quick form with vendor, qty, amount, date, payment status, and group split.",
      tag: "~30 sec per record · best for 1–20 items",
    },
    {
      method: "ai",
      icon: <AutoAwesomeIcon />,
      tone: "pink",
      highlighted: true,
      newPill: true,
      title: "AI-assisted ingest",
      sub:
        "Copy our schema as a prompt. Upload your bill photos to ChatGPT or Gemini externally — paste the structured JSON back here. We'll preview every row before saving.",
      tag: "Best for batches of 20+ · uses external AI",
    },
  ];

  const handle = (m: BackfillMethod) => {
    onChoose(m);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px", maxWidth: 580 } }}
    >
      <DialogTitle
        sx={{
          padding: "16px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${hubTokens.border}`,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: hubTokens.text }}>
            Backfill historical record
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted, marginTop: "2px" }}>
            The work already happened. Skip the request → approval → PO → delivery chain — record it as a single completed transaction.
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ padding: "18px 22px" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {choices.map((c) => (
            <Choice key={c.method} spec={c} onClick={() => handle(c.method)} />
          ))}
        </Box>

        <Box
          sx={{
            marginTop: "14px",
            padding: "11px 13px",
            background: hubTokens.bg,
            border: `1px solid ${hubTokens.hairline}`,
            borderRadius: "9px",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 14, color: hubTokens.muted, marginTop: "1px" }} />
          <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, lineHeight: 1.5 }}>
            <b style={{ color: hubTokens.text }}>New vendor or material?</b>{" "}
            Type the name as-is — we&apos;ll create it as a draft. Office reviews drafts later from Company &gt; Vendors / Materials.
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function Choice({ spec, onClick }: { spec: ChoiceSpec; onClick: () => void }) {
  const colors = hubToneColors(spec.tone);
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: "14px",
        padding: "14px 16px",
        borderRadius: "12px",
        cursor: "pointer",
        fontFamily: hubTokens.font,
        textAlign: "left",
        background: hubTokens.card,
        border: `1.5px solid ${spec.highlighted ? colors.dot : hubTokens.border}`,
        transition: "border-color .12s, transform .12s",
        "&:hover": { borderColor: colors.dot, transform: "translateY(-1px)" },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "9px",
          background: colors.bg,
          color: colors.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          "& svg": { fontSize: 18 },
        }}
      >
        {spec.icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: hubTokens.text }}>
            {spec.title}
          </Typography>
          {spec.newPill && (
            <Box
              component="span"
              sx={{
                padding: "2px 6px",
                borderRadius: "4px",
                background: colors.dot,
                color: "#fff",
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.4px",
                textTransform: "uppercase",
              }}
            >
              AI
            </Box>
          )}
        </Box>
        <Typography sx={{ fontSize: 11.5, color: hubTokens.muted, lineHeight: 1.5, marginBottom: "6px" }}>
          {spec.sub}
        </Typography>
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 7px",
            borderRadius: "4px",
            background: hubTokens.bg,
            color: hubTokens.subtle,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.2px",
          }}
        >
          {spec.tag}
        </Box>
      </Box>
      <ArrowForwardIcon sx={{ fontSize: 14, color: hubTokens.subtle, marginTop: "10px" }} />
    </Box>
  );
}
