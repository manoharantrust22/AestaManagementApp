"use client";

import {
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Inventory2 as MaterialIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { activePacks } from "@/lib/materials/packs";
import type { MaterialWithDetails } from "@/types/material.types";

interface MaterialRequestRowProps {
  material: MaterialWithDetails;
  stock: number;
  /** Quantity currently in the request cart, or null/0 when not added. */
  cartQty: number | null;
  /** Number of cans in the cart for pack-only materials (drives the "N cans" label). */
  cartPackCount?: number | null;
  /** Open the quantity picker for precise entry (tapping the row body / Add). */
  onOpenPicker: () => void;
  /** Inline +/- adjustment. Passing 0 removes the item from the cart. */
  onChangeQty: (newQty: number) => void;
}

/**
 * A single material as an image list row: thumbnail + name + unit + live stock,
 * with an "Add" button (not yet in cart) or an inline − qty + stepper (in cart).
 * Tapping the row body opens the quantity picker for precise entry.
 */
export function MaterialRequestRow({
  material,
  stock,
  cartQty,
  cartPackCount,
  onOpenPicker,
  onChangeQty,
}: MaterialRequestRowProps) {
  const inCart = !!cartQty && cartQty > 0;
  // Pack-only materials are bought in whole cans: the inline ±1 base stepper is
  // meaningless, so we route the user to the picker instead.
  const isPack = !!material.sold_in_packs && activePacks(material.packs).length > 0;

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: inCart ? "primary.main" : "divider",
        bgcolor: inCart ? "action.hover" : "background.paper",
        transition: "border-color 120ms, background-color 120ms",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ p: { xs: 1, md: 0.75 }, pl: { xs: 1, md: 0.75 } }}
      >
        <ButtonBase
          onClick={onOpenPicker}
          aria-label={`Set quantity for ${material.name}`}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            p: 0.75,
            borderRadius: 1.5,
            textAlign: "left",
            justifyContent: "flex-start",
          }}
        >
          <EntityImageAvatar
            src={material.image_url}
            name={material.name}
            size={52}
            radius={1.5}
            fallbackIcon={<MaterialIcon />}
            tint="primary"
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body1" fontWeight={600} noWrap>
              {material.name}
            </Typography>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              sx={{ mt: 0.25, flexWrap: "wrap", rowGap: 0.5 }}
            >
              {material.unit && (
                <Typography variant="caption" color="text.secondary">
                  {isPack ? "sold in cans" : `per ${material.unit}`}
                </Typography>
              )}
              {stock > 0 ? (
                <Chip
                  size="small"
                  icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                  label={`In stock: ${stock}`}
                  color="success"
                  variant="outlined"
                  sx={{ height: 20, "& .MuiChip-label": { px: 0.75 } }}
                />
              ) : (
                <Chip
                  size="small"
                  label="Out of stock"
                  variant="outlined"
                  sx={{
                    height: 20,
                    color: "text.disabled",
                    borderColor: "divider",
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              )}
            </Stack>
          </Box>
        </ButtonBase>

        {inCart && isPack ? (
          <Button
            onClick={onOpenPicker}
            variant="contained"
            size="small"
            sx={{
              flexShrink: 0,
              mr: 0.5,
              minHeight: 40,
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            {cartPackCount ?? 1} can{(cartPackCount ?? 1) > 1 ? "s" : ""}
          </Button>
        ) : inCart ? (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.25}
            sx={{ flexShrink: 0, pr: 0.5 }}
          >
            <IconButton
              onClick={() => onChangeQty((cartQty ?? 0) - 1)}
              aria-label={`Decrease ${material.name}`}
              sx={{ border: 1, borderColor: "divider", width: 40, height: 40 }}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
            <Typography
              sx={{
                minWidth: 32,
                textAlign: "center",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {cartQty}
            </Typography>
            <IconButton
              onClick={() => onChangeQty((cartQty ?? 0) + 1)}
              aria-label={`Increase ${material.name}`}
              sx={{ border: 1, borderColor: "divider", width: 40, height: 40 }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : (
          <Button
            onClick={onOpenPicker}
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            sx={{
              flexShrink: 0,
              mr: 0.5,
              minHeight: 40,
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            Add
          </Button>
        )}
      </Stack>
    </Card>
  );
}
