"use client";

import { useRouter } from "next/navigation";
import { Box, Chip, Stack, Typography, Collapse, Button } from "@mui/material";
import { Inventory2, ChevronRight } from "@mui/icons-material";
import { useState } from "react";
import { useStaleMaterials } from "@/hooks/queries/useStaleMaterials";

/**
 * Non-blocking reminder shown under the material-usage item: in-stock materials
 * not logged in a while. Tapping one deep-links to the usage screen. This is a
 * nudge, not a requirement — the usage item is satisfied by any log or an
 * explicit "nothing to log".
 */
export default function StaleMaterialsHint({
  siteId,
  usageHref,
}: {
  siteId: string | undefined;
  usageHref: string;
}) {
  const router = useRouter();
  const { data: stale = [], isLoading } = useStaleMaterials(siteId, 4, 8);
  const [open, setOpen] = useState(true);

  if (isLoading || stale.length === 0) return null;

  return (
    <Box sx={{ mt: 1.5, pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
      <Button
        size="small"
        onClick={() => setOpen((o) => !o)}
        sx={{ textTransform: "none", color: "text.secondary", px: 0.5 }}
        startIcon={<Inventory2 fontSize="small" />}
      >
        {stale.length} material{stale.length === 1 ? "" : "s"} not used in a while
      </Button>
      <Collapse in={open}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mt: 0.5 }}>
          {stale.map((m) => (
            <Chip
              key={m.inventory_id}
              size="small"
              variant="outlined"
              icon={<ChevronRight fontSize="small" />}
              onClick={() => router.push(usageHref)}
              clickable
              label={
                `${m.material_name}${m.brand_name ? ` · ${m.brand_name}` : ""} — ` +
                (m.last_used
                  ? `${m.days_since}d ago`
                  : "never logged")
              }
            />
          ))}
        </Stack>
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
          Reminders only — not required to complete today.
        </Typography>
      </Collapse>
    </Box>
  );
}
