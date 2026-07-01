"use client";

import { useMemo, useState } from "react";
import { Alert, Box, Card, Chip, Stack, Switch, Tooltip, Typography } from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import { useLaborCategories, type LaborCategory } from "@/hooks/queries/useLaborCategories";
import {
  useSiteTradeSettings,
  useSiteTradeWorkspaceUsage,
  useUpsertSiteTradeSetting,
} from "@/hooks/queries/useSiteTradeSettings";
import { useTradeContractSummaries } from "@/hooks/queries/useTradeContractSummary";
import { QuickCreateContractDialog } from "@/components/trades/QuickCreateContractDialog";
import { NoContractPrompt } from "./NoContractPrompt";

/**
 * Per-site Trade Workspaces — turn each trade's WORKSPACE (attendance/salary/tea/
 * holidays surface) and ACTIVE (offered for new contracts) state on or off for THIS
 * site. Writes only overrides into `site_trade_settings`; a trade with no override
 * inherits the company default (on / offered) = today's behaviour. Mirrors the company
 * Trades card, scoped per-site, with the same "data locks workspace ON" guard.
 */
export default function SiteTradeWorkspacesManager({ siteId }: { siteId: string }) {
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  const { data: categories = [], isLoading } = useLaborCategories(false);
  const { data: overrides = [] } = useSiteTradeSettings(siteId);
  const { data: usage = [] } = useSiteTradeWorkspaceUsage(siteId);
  const upsert = useUpsertSiteTradeSetting();
  const saving = upsert.isPending;
  const [error, setError] = useState("");

  // Money summaries — to flag a trade whose Workspace is ON but has no detailed
  // contract to record attendance against (and offer to create one inline).
  const summaries = useTradeContractSummaries(siteId);
  const [createCtx, setCreateCtx] = useState<{ tradeCategoryId: string; tradeName: string } | null>(null);

  // Only catalog-active trades are offered/workspaced anywhere — per-site control of a
  // retired trade is meaningless, so list the active catalog only.
  const trades = useMemo(() => categories.filter((c) => c.is_active), [categories]);

  const overrideMap = useMemo(
    () => new Map(overrides.map((o) => [o.trade_category_id, o])),
    [overrides]
  );
  const usageMap = useMemo(
    () => new Map(usage.map((u) => [u.trade_category_id, u.total_workspace_rows])),
    [usage]
  );

  const toggleWorkspace = async (c: LaborCategory, effectiveWs: boolean, lockedOn: boolean) => {
    // Guard (defensive — the disabled Switch already blocks this): a trade holding
    // workspace data AT THIS SITE can't be switched off. Off is hide-only; data stays.
    if (effectiveWs && lockedOn) return;
    try {
      await upsert.mutateAsync({ siteId, tradeCategoryId: c.id, has_workspace: !effectiveWs });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleOffered = async (c: LaborCategory, effectiveOffered: boolean) => {
    try {
      await upsert.mutateAsync({ siteId, tradeCategoryId: c.id, is_offered: !effectiveOffered });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const renderCard = (c: LaborCategory) => {
    const ov = overrideMap.get(c.id);
    const effectiveWs = ov?.has_workspace ?? true;
    const effectiveOffered = ov?.is_offered ?? true;
    const hasDetailedContract = summaries.byCategoryId.get(c.id)?.hasDetailedContract ?? false;
    const showNoContractPrompt = effectiveWs && !hasDetailedContract;
    const usageRows = usageMap.get(c.id) ?? 0;
    const lockedOn = usageRows > 0;
    const wsDisabled = !canEdit || saving || (effectiveWs && lockedOn);
    const wsTooltip = effectiveWs
      ? lockedOn
        ? `Workspace ON — this site has ${usageRows} attendance / settlement ${
            usageRows === 1 ? "entry" : "entries"
          } for this trade, so it can't be switched off here.`
        : "Workspace ON for this site — full attendance, salary, tea & holidays. No data yet, so you can switch it off."
      : "Workspace OFF for this site — ladder only (contracts, sections, tasks). Switch on to add attendance, salary, tea & holidays.";

    return (
      <Card key={c.id} variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
              <Typography variant="subtitle2" fontWeight={600}>
                {c.display_order}. {c.name}
              </Typography>
              {c.is_system_seed && <Chip size="small" variant="outlined" label="built-in" />}
              {!effectiveWs && <Chip size="small" variant="outlined" label="ladder only" />}
              {!effectiveOffered && <Chip size="small" color="warning" label="not offered" />}
            </Stack>
            {c.description && (
              <Typography variant="body2" color="text.secondary">
                {c.description}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
            {/* Workspace = the full attendance/salary/tea/holiday surface for this trade at this site. */}
            <Tooltip title={wsTooltip}>
              <Box component="span" sx={{ textAlign: "center" }}>
                <Typography
                  variant="caption"
                  sx={{ display: "block", color: "text.secondary", lineHeight: 1.1 }}
                >
                  Workspace
                </Typography>
                <Switch
                  size="small"
                  checked={effectiveWs}
                  disabled={wsDisabled}
                  onChange={() => toggleWorkspace(c, effectiveWs, lockedOn)}
                />
              </Box>
            </Tooltip>
            {/* Active = offered as a choice when creating new contracts at this site. */}
            <Tooltip
              title={
                effectiveOffered
                  ? "Active — offered for new contracts at this site"
                  : "Off — not offered for new contracts at this site (existing contracts stay)"
              }
            >
              <Box component="span" sx={{ textAlign: "center" }}>
                <Typography
                  variant="caption"
                  sx={{ display: "block", color: "text.secondary", lineHeight: 1.1 }}
                >
                  Active
                </Typography>
                <Switch
                  size="small"
                  checked={effectiveOffered}
                  disabled={!canEdit || saving}
                  onChange={() => toggleOffered(c, effectiveOffered)}
                />
              </Box>
            </Tooltip>
          </Stack>
        </Stack>
        <NoContractPrompt
          show={showNoContractPrompt}
          onCreate={() => setCreateCtx({ tradeCategoryId: c.id, tradeName: c.name })}
        />
      </Card>
    );
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Turn each trade&apos;s <strong>workspace</strong> (per-labourer attendance, salary, tea
        &amp; holidays) and whether it&apos;s <strong>offered for new contracts</strong> on or off
        <strong> for this site</strong>. Defaults to on. Switching off only hides — existing data is
        never deleted, and once a trade holds attendance/settlement data here its workspace locks on.
        Trades themselves (names, tea, order) are managed company-wide under Company → Trades.
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : trades.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
          No trades yet. Add them under Company → Trades.
        </Typography>
      ) : (
        <Stack spacing={1}>{trades.map(renderCard)}</Stack>
      )}

      {createCtx && (
        <QuickCreateContractDialog
          open={!!createCtx}
          onClose={() => setCreateCtx(null)}
          onCreated={() => setCreateCtx(null)}
          siteId={siteId}
          tradeCategoryId={createCtx.tradeCategoryId}
          tradeName={createCtx.tradeName}
          tier="contract"
          initialStatus="active"
        />
      )}
    </Box>
  );
}
