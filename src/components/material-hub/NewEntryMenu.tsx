"use client";

/**
 * 560px launcher modal for the Hub's "+ New entry" button. Three equal-billing
 * entry choices: Request material (standard 5-step flow), Bought at shop
 * (spot purchase post-facto), Record delivery (receives an arriving PO).
 *
 * "Bought at shop" is highlighted with a pink border and NEW pill.
 *
 * Mirrors `NewEntryMenu` in docs/MaterialHub_Redesign/proto-spot.jsx.
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
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useRouter } from "next/navigation";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";

interface EntryChoiceSpec {
  key: string;
  title: string;
  subtitle: string;
  tag: string;
  tone: HubTone;
  highlighted?: boolean;
  newPill?: boolean;
  icon: React.ReactNode;
  /** Either route via Next router or trigger an in-app modal callback. */
  href?: string;
  onClick?: () => void;
}

interface EntryCardProps {
  spec: EntryChoiceSpec;
  onClick: () => void;
}

function EntryCard({ spec, onClick }: EntryCardProps) {
  const colors = hubToneColors(spec.tone);
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 16px",
        background: hubTokens.card,
        border: `1.5px solid ${spec.highlighted ? colors.dot : hubTokens.border}`,
        borderRadius: "12px",
        cursor: "pointer",
        width: "100%",
        fontFamily: hubTokens.font,
        transition: "border-color .12s, transform .12s",
        "&:hover": {
          borderColor: colors.dot,
          transform: "translateY(-1px)",
        },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "8px",
          background: colors.bg,
          color: colors.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          "& svg": { fontSize: 20 },
        }}
      >
        {spec.icon}
      </Box>
      <Box sx={{ flex: 1, textAlign: "left", display: "flex", flexDirection: "column", gap: "2px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              color: hubTokens.text,
            }}
          >
            {spec.title}
          </Typography>
          {spec.newPill && (
            <Box
              component="span"
              sx={{
                padding: "1px 7px",
                background: colors.dot,
                color: "#fff",
                borderRadius: "999px",
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              NEW
            </Box>
          )}
        </Box>
        <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
          {spec.subtitle}
        </Typography>
        <Box
          component="span"
          sx={{
            display: "inline-block",
            width: "fit-content",
            padding: "1px 7px",
            marginTop: "4px",
            borderRadius: "4px",
            background: hubTokens.hairline,
            color: hubTokens.muted,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.3px",
            textTransform: "uppercase",
          }}
        >
          {spec.tag}
        </Box>
      </Box>
      <ArrowForwardIcon
        sx={{ fontSize: 18, color: hubTokens.subtle, flexShrink: 0 }}
      />
    </Box>
  );
}

export interface NewEntryMenuProps {
  open: boolean;
  onClose: () => void;
  /** Triggered when the user picks "Backfill historical record" — opens BackfillEntryDialog. */
  onBackfill?: () => void;
}

export default function NewEntryMenu({ open, onClose, onBackfill }: NewEntryMenuProps) {
  const router = useRouter();

  const choices: EntryChoiceSpec[] = [
    {
      key: "request",
      title: "Request material",
      subtitle: "Tell office what to buy — they approve, place PO, schedule delivery.",
      tag: "Standard flow · 5 steps",
      tone: "primary",
      icon: <ReceiptIcon />,
      href: "/site/quick-request",
    },
    {
      key: "spot",
      title: "Bought at shop",
      subtitle: "Record a small-quantity walk-in purchase you've already paid from your wallet.",
      tag: "Spot · post-facto · < 30 sec",
      tone: "pink",
      highlighted: true,
      newPill: true,
      icon: <ShoppingCartIcon />,
      href: "/site/spot-purchase",
    },
    {
      key: "backfill",
      title: "Backfill historical record",
      subtitle:
        "Bulk-import past purchases that happened before the app. Manual entry or AI-assisted from bill photos.",
      tag: "One-time · skips full flow",
      tone: "warn",
      icon: <CalendarMonthIcon />,
      onClick: onBackfill,
    },
    {
      key: "deliver",
      title: "Record delivery",
      subtitle: "Verify the goods arriving from an open PO — quality, qty, photos.",
      tag: "Receives an existing PO",
      tone: "warn",
      icon: <LocalShippingIcon />,
      href: "/site/delivery-verification",
    },
  ];

  const handleChoice = (spec: EntryChoiceSpec) => {
    onClose();
    if (spec.onClick) {
      spec.onClick();
      return;
    }
    if (spec.href) router.push(spec.href);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "14px",
          maxWidth: 560,
        },
      }}
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
            New entry
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted }}>
            Four ways material gets into the system.
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ padding: "18px 22px" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {choices.map((c) => (
            <EntryCard key={c.key} spec={c} onClick={() => handleChoice(c)} />
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
