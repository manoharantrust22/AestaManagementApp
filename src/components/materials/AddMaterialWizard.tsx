"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import {
  Close as CloseIcon,
  Storefront as BrandIcon,
  Category as BulkIcon,
} from "@mui/icons-material";
import BrandedMaterialWizard from "@/components/materials/BrandedMaterialWizard";
import GenericMaterialForm from "@/components/materials/GenericMaterialForm";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { MaterialCategory } from "@/types/material.types";

interface AddMaterialWizardProps {
  open: boolean;
  onClose: () => void;
  categories: MaterialCategory[];
}

type ForkPath = "fork" | "branded" | "generic";

function ForkCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      sx={{
        flex: 1,
        minHeight: 140,
        border: 2,
        borderColor: "divider",
        borderRadius: 2,
        p: 2.5,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        transition: "border-color 150ms ease, background-color 150ms ease",
        "&:hover, &:focus-visible": {
          borderColor: "primary.main",
          bgcolor: "action.hover",
        },
      }}
    >
      <Box sx={{ color: "primary.main" }}>{icon}</Box>
      <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{title}</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{description}</Typography>
    </Box>
  );
}

/**
 * Entry point for "Add Material". Asks the one question that decides
 * everything downstream — brand or bulk — before showing a single field.
 * Replaces the old flat form where category/brand/variant confusion all
 * showed up on the same screen regardless of what was actually being added.
 */
export default function AddMaterialWizard({ open, onClose, categories }: AddMaterialWizardProps) {
  const isMobile = useIsMobile();
  const [path, setPath] = useState<ForkPath>("fork");

  useEffect(() => {
    if (open) setPath("fork");
  }, [open]);

  const handleClose = () => {
    setPath("fork");
    onClose();
  };

  if (path === "branded") {
    return (
      <BrandedMaterialWizard
        open={open}
        onClose={handleClose}
        categories={categories}
        onBackToFork={() => setPath("fork")}
      />
    );
  }

  if (path === "generic") {
    return (
      <GenericMaterialForm
        open={open}
        onClose={handleClose}
        categories={categories}
        onBackToFork={() => setPath("fork")}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2 } }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", px: 2.5, py: 1.75, borderBottom: 1, borderColor: "divider" }}
      >
        <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 700 }}>Add material</Typography>
        <IconButton onClick={handleClose} size="small" sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>
      <DialogContent sx={{ px: 2.5, py: 3 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 2, textAlign: "center" }}>
          Do you buy this from a specific brand?
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
          <ForkCard
            icon={<BrandIcon sx={{ fontSize: 32 }} />}
            title="Yes — a brand"
            description="e.g. MCP Tixolite, Berger, Ramco. You'll add the brand, color/size variants, and pack prices."
            onClick={() => setPath("branded")}
          />
          <ForkCard
            icon={<BulkIcon sx={{ fontSize: 32 }} />}
            title="No — bulk / commodity"
            description="e.g. sand, aggregate. Just name, category, and unit — no variants needed."
            onClick={() => setPath("generic")}
          />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
