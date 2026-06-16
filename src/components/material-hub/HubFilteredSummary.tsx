"use client";

/**
 * Summary strip shown above the Hub results when a material filter is active.
 *
 * Splits the filtered material into GROUP (shared cluster pool) and OWN (the
 * viewing site's dedicated own-site purchases) so the engineer can tell, at a
 * glance, what's group vs own — and, on expand, how the group pool's usage and
 * remaining stock split across the cluster sites.
 *
 * GROUP figures come from the threads (cluster-wide, ledger-true). OWN
 * used/remaining come from the viewing site's live stock + usage rows, since
 * own-bucket POs carry no per-PO inventory. A group batch the owning site
 * self-consumed stays GROUP — never counted as own.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, Button, Collapse } from "@mui/material";
import {
  SwapHoriz as SwapIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Link as LinkIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { fmtQty } from "@/lib/formatters";
import { inr } from "@/lib/material-hub/formatters";
import { summarizeScopedMaterial } from "@/lib/material-hub/scopedMaterialSummary";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";
import { useOwnMaterialStock } from "@/hooks/queries/useOwnMaterialStock";
import { useGroupMaterialPurchases } from "@/hooks/queries/useMaterialPurchases";
import {
  useInterSiteBalances,
  useUnpaidInterSiteSettlements,
} from "@/hooks/queries/useInterSiteSettlements";
import {
  legsFromBalances,
  legsFromUnpaidSettlements,
  summarizeOutstanding,
} from "@/lib/material-hub/interSiteOutstanding";
import PerSiteUsageBar from "@/components/material-hub/PerSiteUsageBar";
import { assignSiteAccents } from "@/lib/material-hub/siteAccents";

interface HubFilteredSummaryProps {
  threads: MaterialThread[];
  materialLabel: string;
  viewingSiteName: string;
  viewingSiteId?: string;
  siteGroupId?: string | null;
  materialId?: string;
  filterKind?: string;
  /** When provided, shows a "Reconcile usage" action (group materials only). */
  onReconcile?: () => void;
}

function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string | null;
  tone?: string;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 56 }}>
      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.4px",
          color: hubTokens.muted,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 15,
          fontWeight: 800,
          lineHeight: "19px",
          color: tone ?? hubTokens.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtQty(value)}
        {unit ? (
          <Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: hubTokens.muted, ml: 0.5 }}>
            {unit}
          </Box>
        ) : null}
      </Typography>
    </Box>
  );
}

function ScopeChip({ label, tone }: { label: string; tone: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: "8px",
        height: 22,
        borderRadius: "6px",
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.4px",
        textTransform: "uppercase",
        color: tone,
        background: `${tone}14`,
        whiteSpace: "nowrap",
        minWidth: 58,
        justifyContent: "center",
      }}
    >
      {label}
    </Box>
  );
}

export default function HubFilteredSummary({
  threads,
  materialLabel,
  viewingSiteName,
  viewingSiteId,
  siteGroupId,
  materialId,
  filterKind,
  onReconcile,
}: HubFilteredSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const isBrand = filterKind === "brand";

  // Own (viewing-site) stock for the material family — drives OWN remaining and
  // gives the family ids used to filter the site's usage rows.
  const { ownStockRows, ownUsageRows } = useOwnMaterialStock({
    siteId: viewingSiteId,
    materialId,
    enabled: !isBrand,
  });
  const { data: groupBatches = [] } = useGroupMaterialPurchases(siteGroupId ?? undefined);

  // Group batch ref-codes — authoritative from group purchases, with a fallback
  // to the batch codes already on the group threads.
  const groupRefCodes = useMemo(() => {
    const set = new Set<string>();
    for (const b of groupBatches as Array<{ ref_code?: string | null }>) {
      if (b.ref_code) set.add(b.ref_code);
    }
    for (const t of threads) {
      if (t.kind === "group" && t.inventory?.batch) set.add(t.inventory.batch);
    }
    return set;
  }, [groupBatches, threads]);

  const s = useMemo(
    () =>
      summarizeScopedMaterial({
        threads,
        viewingSiteId: viewingSiteId ?? "",
        viewingSiteName,
        ownStockRows,
        ownUsageRows,
        groupRefCodes,
      }),
    [threads, viewingSiteId, viewingSiteName, ownStockRows, ownUsageRows, groupRefCodes]
  );

  const hasGroup = s.group.ordered > 0 || s.group.used > 0 || s.group.remaining > 0;
  const heldAccents = useMemo(
    () => assignSiteAccents(s.group.perSite.map((p) => p.site_id), viewingSiteId ?? null),
    [s.group.perSite, viewingSiteId]
  );
  const groupHeldTotal = s.group.perSite.reduce((sum, p) => sum + p.held, 0);
  const canExpand = s.group.perSite.length > 0 || s.own.present;

  // Consolidated inter-site outstanding for THIS material family across all its
  // batches — the "how much do I owe for PPC, all together" number. Combines
  // not-yet-raised pending usage with raised-but-unpaid settlements so it stays
  // honest after a Generate (which the pending-only balance would zero out).
  const router = useRouter();
  const { data: interSiteBalances = [] } = useInterSiteBalances(siteGroupId ?? undefined);
  const { data: unpaidSettlementLegs = [] } = useUnpaidInterSiteSettlements(
    siteGroupId ?? undefined
  );
  const familyMaterialIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of threads) if (t.material_id) set.add(t.material_id);
    return set;
  }, [threads]);
  const interSite = useMemo(() => {
    if (!siteGroupId) return null;
    const legs = [
      ...legsFromBalances(interSiteBalances),
      ...legsFromUnpaidSettlements(unpaidSettlementLegs),
    ];
    const summary = summarizeOutstanding(legs, {
      familyMaterialIds,
      viewerSiteId: viewingSiteId,
    });
    return summary.total > 0 ? summary : null;
  }, [siteGroupId, interSiteBalances, unpaidSettlementLegs, familyMaterialIds, viewingSiteId]);

  if (threads.length === 0) return null;

  return (
    <Box
      sx={{
        background: hubTokens.card,
        border: `1px solid ${hubTokens.border}`,
        borderRadius: "12px",
        padding: "12px 16px",
        mb: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Header row: material + thread count, actions on the right */}
      <Box sx={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", flexDirection: "column", mr: "auto" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: hubTokens.text }}>
            {materialLabel}
          </Typography>
          <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
            {s.threadCount} thread{s.threadCount === 1 ? "" : "s"}
            {s.unit === null ? " · mixed units" : ""}
          </Typography>
        </Box>

        {onReconcile && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<SwapIcon fontSize="small" />}
            onClick={onReconcile}
            sx={{ textTransform: "none", flexShrink: 0 }}
          >
            Reconcile usage
          </Button>
        )}

        {canExpand && (
          <Button
            size="small"
            onClick={() => setExpanded((v) => !v)}
            endIcon={expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            sx={{ textTransform: "none", flexShrink: 0, color: hubTokens.muted }}
          >
            {expanded ? "Hide" : "Details"}
          </Button>
        )}
      </Box>

      {/* GROUP scope line */}
      {hasGroup && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <ScopeChip label="Group" tone={hubTokens.pink} />
          <Metric label="Ordered" value={s.group.ordered} unit={s.unit} />
          <Metric label="Delivered" value={s.group.delivered} unit={s.unit} />
          <Metric label="Used" value={s.group.used} unit={s.unit} />
          <Metric label="Remaining" value={s.group.remaining} unit={s.unit} tone={hubTokens.success} />
        </Box>
      )}

      {/* OWN scope line */}
      {!isBrand && s.own.present && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <ScopeChip label="Own" tone={hubTokens.primary} />
          <Metric label="Ordered" value={s.own.ordered} unit={s.unit} />
          <Metric label="Delivered" value={s.own.delivered} unit={s.unit} />
          <Metric label="Used" value={s.own.used} unit={s.unit} />
          <Metric label="On hand" value={s.own.remaining} unit={s.unit} tone={hubTokens.success} />
        </Box>
      )}

      {/* Consolidated inter-site outstanding for this material family */}
      {interSite && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            background: hubTokens.warnSoft,
            borderRadius: "8px",
            padding: "8px 12px",
          }}
        >
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              color: hubTokens.warn,
              fontWeight: 800,
              fontSize: 10.5,
              letterSpacing: "0.4px",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            <LinkIcon sx={{ fontSize: 13 }} /> Inter-site
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", mr: "auto", minWidth: 0 }}>
            {interSite.netLines.map((n) => (
              <Typography
                key={`${n.owerSiteId}-${n.owedSiteId}`}
                sx={{ fontSize: 12, color: hubTokens.text, fontWeight: 600 }}
              >
                <strong>{n.owerName}</strong> owes <strong>{n.owedName}</strong>{" "}
                <Box component="span" sx={{ fontFamily: hubTokens.mono, fontWeight: 800 }}>
                  {inr(n.amount)}
                </Box>
              </Typography>
            ))}
            <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
              {interSite.hasRaised
                ? interSite.hasUnraised
                  ? "Settlement raised — awaiting payment · plus usage not yet raised"
                  : "Settlement raised — awaiting payment (no money has moved yet)"
                : "Cross-site usage not yet put into a settlement"}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            color="warning"
            endIcon={<ArrowForwardIcon fontSize="small" />}
            onClick={() => router.push("/site/inter-site-settlement")}
            sx={{ textTransform: "none", flexShrink: 0 }}
          >
            {interSite.hasRaised ? "Record payment" : "Settle inter-site"}
          </Button>
        </Box>
      )}

      {/* Expanded per-site detail */}
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px", pt: "4px" }}>
          {s.group.perSite.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <PerSiteUsageBar
                label="Group pool — used by site"
                perSite={s.group.perSite.map((p) => ({
                  site_id: p.site_id,
                  site_name: p.site_name,
                  used: p.used,
                }))}
                received={s.group.used + groupHeldTotal}
                remaining={groupHeldTotal}
                unit={s.unit ?? ""}
                viewingSiteId={viewingSiteId ?? null}
              />

              <Box sx={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <Typography
                  sx={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.4px",
                    color: hubTokens.muted,
                    textTransform: "uppercase",
                  }}
                >
                  Group pool — held now
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {s.group.perSite.map((p) => (
                    <Box key={p.site_id} sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "2px",
                          background: heldAccents.get(p.site_id) ?? hubTokens.subtle,
                        }}
                      />
                      <Typography sx={{ fontSize: 11, color: hubTokens.muted, fontWeight: 600 }}>
                        {p.site_name}
                      </Typography>
                      <Typography
                        sx={{ fontSize: 11, fontFamily: hubTokens.mono, color: hubTokens.text, fontWeight: 700 }}
                      >
                        {fmtQty(p.held)}
                        {s.unit ? ` ${s.unit}` : ""}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}

          {!isBrand && s.own.present && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <Typography
                sx={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.4px",
                  color: hubTokens.muted,
                  textTransform: "uppercase",
                }}
              >
                Own (dedicated) — {viewingSiteName}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: hubTokens.text }}>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {fmtQty(s.own.used)}
                  {s.unit ? ` ${s.unit}` : ""}
                </Box>{" "}
                used ·{" "}
                <Box component="span" sx={{ fontWeight: 700, color: hubTokens.success }}>
                  {fmtQty(s.own.remaining)}
                  {s.unit ? ` ${s.unit}` : ""}
                </Box>{" "}
                on hand
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
