/**
 * Shared shell for AI-assisted catalog ingestion (Purchase / Quotation / Warranty).
 *
 * Mode-specific behavior (prompt template, Zod schema, fuzzy match, commit RPC)
 * is supplied via the `MODE_REGISTRY` lookup; this shell stays mode-agnostic.
 */

"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import {
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";

import type {
  BatchResolvedPreview,
  IngestionMode,
  IngestionStep,
  ResolvedPreview,
} from "@/lib/ai-ingestion/types";
import type { AiPurchaseBatchOutput } from "@/lib/ai-ingestion/schemas";
import type { BatchCommitResult } from "@/lib/ai-ingestion/modes/purchase.batch";
import { useAIIngestion } from "@/hooks/useAIIngestion";
import { useIsMobile } from "@/hooks/useIsMobile";
import { buildModeRegistry } from "@/lib/ai-ingestion/modes";
import {
  AI_CATALOG_QUERY_KEYS,
  fetchVendorsForMatch,
  fetchMaterialsForMatch,
} from "@/lib/ai-ingestion/modes/purchase";

import ModeSelector from "./ModeSelector";
import ContextPicker from "./ContextPicker";
import PromptCopyPanel from "./PromptCopyPanel";
import PasteAndParse from "./PasteAndParse";
import PreviewTable from "./PreviewTable";
import BatchPreviewTable from "./BatchPreviewTable";
import CommitProgress from "./CommitProgress";

interface SiteOption {
  id: string;
  name: string;
}

export interface AIIngestionDialogProps {
  open: boolean;
  onClose: () => void;
  /** When omitted, user picks via ModeSelector. */
  initialMode?: IngestionMode;
  /** Locks the site picker to a single site. */
  lockedSite?: SiteOption | null;
  /** Sites available to the user (when site is not locked). */
  sites?: SiteOption[];
  /** Called after a successful commit, with the mode-specific result. */
  onSaved?: (result: unknown) => void;
}

function PillStepper({
  steps,
  activeIndex,
  sx,
}: {
  steps: Array<{ key: string; label: string }>;
  activeIndex: number;
  sx?: object;
}) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="center" sx={sx}>
      {steps.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <Fragment key={s.key}>
            {i > 0 && (
              <Box sx={{ width: 14, height: 1, bgcolor: "divider", mx: 0.5, flexShrink: 0 }} />
            )}
            {active ? (
              <Chip
                size="small"
                label={`${i + 1} · ${s.label}`}
                color="primary"
                sx={{ fontWeight: 600 }}
              />
            ) : done ? (
              <CheckCircleIcon sx={{ fontSize: 18, color: "success.main", flexShrink: 0 }} />
            ) : (
              <Box
                sx={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "2px solid",
                  borderColor: "divider",
                  flexShrink: 0,
                }}
              />
            )}
          </Fragment>
        );
      })}
    </Stack>
  );
}

const VISIBLE_STEPS: Array<{ key: IngestionStep; label: string }> = [
  { key: "mode", label: "Mode" },
  { key: "context", label: "Context" },
  { key: "prompt", label: "Copy prompt" },
  { key: "paste", label: "Paste response" },
  { key: "preview", label: "Preview & confirm" },
];

export default function AIIngestionDialog({
  open,
  onClose,
  initialMode,
  lockedSite,
  sites,
  onSaved,
}: AIIngestionDialogProps) {
  const isMobile = useIsMobile();
  const [parsing, setParsing] = useState(false);
  const queryClient = useQueryClient();
  const registry = useMemo(() => buildModeRegistry(queryClient), [queryClient]);

  const ingest = useAIIngestion({
    initialMode,
    lockedSiteId: lockedSite?.id,
    onSuccess: onSaved,
  });

  const activeMode = ingest.state.mode;
  const config = activeMode ? registry[activeMode] ?? null : null;

  // Sync locked site into hook state on open.
  useEffect(() => {
    if (!open) return;
    if (lockedSite?.id && ingest.state.ctx.siteId !== lockedSite.id) {
      ingest.setContext({ siteId: lockedSite.id });
    }
  }, [open, lockedSite, ingest]);

  // Prefetch vendor + material catalogs as soon as the dialog opens so they
  // are ready in the React Query cache by the time the user reaches Parse & preview.
  // Uses JOIN-free minimal selects (AI_CATALOG_QUERY_KEYS) so the queries are
  // fast and Cloudflare Worker can edge-cache the responses.
  useEffect(() => {
    if (!open) return;
    queryClient.prefetchQuery({
      queryKey: AI_CATALOG_QUERY_KEYS.vendors,
      queryFn: fetchVendorsForMatch,
      staleTime: 30 * 60 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: AI_CATALOG_QUERY_KEYS.materials,
      queryFn: fetchMaterialsForMatch,
      staleTime: 30 * 60 * 1000,
    });
  }, [open, queryClient]);

  const close = () => {
    if (ingest.state.step === "committing") return;
    onClose();
    setTimeout(() => ingest.reset(), 200);
  };

  const onParse = async () => {
    if (!config) return;
    setParsing(true);
    try {
      await ingest.parseAndPreview(config);
    } finally {
      setParsing(false);
    }
  };

  const onCommit = async () => {
    if (!config) return;
    await ingest.commit(config);
  };

  const visibleSteps = initialMode
    ? VISIBLE_STEPS.filter((s) => s.key !== "mode")
    : VISIBLE_STEPS;
  const activeStepIdx = Math.max(
    0,
    visibleSteps.findIndex((s) => s.key === ingest.state.step),
  );

  const isOverlay =
    ingest.state.step === "committing" ||
    ingest.state.step === "done" ||
    ingest.state.step === "error";

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      keepMounted={false}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h6" component="span">
            Ingest from AI
          </Typography>
          {config ? (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              · {config.label}
            </Typography>
          ) : null}
        </Box>
        <IconButton
          edge="end"
          onClick={close}
          aria-label="close"
          disabled={ingest.state.step === "committing"}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ minHeight: 480 }}>
        {!isOverlay ? (
          isMobile ? (
            <PillStepper steps={visibleSteps} activeIndex={activeStepIdx} sx={{ mb: 2 }} />
          ) : (
            <Stepper activeStep={activeStepIdx} alternativeLabel sx={{ mb: 3 }}>
              {visibleSteps.map((s) => (
                <Step key={s.key}>
                  <StepLabel>{s.label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )
        ) : null}

        {ingest.state.step === "mode" ? (
          <ModeSelector selected={activeMode} onSelect={ingest.setMode} />
        ) : null}

        {ingest.state.step === "context" && config ? (
          <ContextPicker
            mode={config.mode}
            ctx={ingest.state.ctx}
            onChange={ingest.setContext}
            onModeChange={ingest.setMode}
            lockedSite={lockedSite}
            sites={sites ?? []}
          />
        ) : null}

        {ingest.state.step === "prompt" && config ? (
          <PromptCopyPanel
            prompt={config.buildPrompt(ingest.state.ctx)}
            modeLabel={config.label}
          />
        ) : null}

        {ingest.state.step === "paste" && config ? (
          <PasteAndParse
            pasteText={ingest.state.pasteText}
            parseError={ingest.state.parseError}
            isParsing={parsing}
            onChange={ingest.setPaste}
            onParse={onParse}
          />
        ) : null}

        {ingest.state.step === "preview" &&
        config &&
        ingest.state.preview &&
        ingest.state.parsed ? (
          config.mode === "purchase_batch" ? (
            <BatchPreviewTable
              batch={ingest.state.preview as BatchResolvedPreview}
              parsed={ingest.state.parsed as AiPurchaseBatchOutput}
              billPhotos={ingest.state.ctx.billUrls}
              selectedDate={ingest.state.ctx.defaultDate}
              summary={config.summary(ingest.state.parsed)}
              onPatch={ingest.patchPreview}
            />
          ) : (
            <PreviewTable
              preview={ingest.state.preview as ResolvedPreview}
              summary={config.summary(ingest.state.parsed)}
              onPatch={ingest.patchPreview}
              selectedDate={ingest.state.ctx.defaultDate}
            />
          )
        ) : null}

        {ingest.state.step === "committing" && ingest.state.commitState ? (
          <CommitProgress state={ingest.state.commitState} />
        ) : null}

        {ingest.state.step === "done" ? (
          (() => {
            const batch = ingest.state.result as BatchCommitResult | null;
            if (batch && typeof batch.savedCount === "number" && typeof batch.total === "number") {
              const allOk = batch.failedCount === 0;
              return (
                <Box>
                  <Alert severity={allOk ? "success" : "warning"} sx={{ mb: 2 }}>
                    {batch.savedCount} of {batch.total} bill{batch.total === 1 ? "" : "s"} saved
                    {allOk
                      ? "."
                      : ` · ${batch.failedCount} need${
                          batch.failedCount === 1 ? "s" : ""
                        } attention.`}
                  </Alert>
                  {batch.failures.length > 0 ? (
                    <Stack spacing={0.5} sx={{ mb: 2 }}>
                      {batch.failures.map((f) => (
                        <Typography key={f.index} variant="caption" color="error.main">
                          • {f.label}: {f.error}
                        </Typography>
                      ))}
                    </Stack>
                  ) : null}
                  <Typography variant="body2">
                    {allOk
                      ? "All bills are in the catalog."
                      : "Re-ingest the failed bill(s) separately, or close."}
                  </Typography>
                </Box>
              );
            }
            return (
              <Box>
                <Alert severity="success" sx={{ mb: 2 }}>
                  Saved successfully. Ref:{" "}
                  <strong>
                    {(ingest.state.result as { ref_code?: string } | null)?.ref_code ??
                      "(see catalog)"}
                  </strong>
                </Alert>
                <Typography variant="body2">
                  You can ingest another bill or close the dialog.
                </Typography>
              </Box>
            );
          })()
        ) : null}

        {ingest.state.step === "error" ? (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => ingest.goTo("preview")}
              >
                Try again
              </Button>
            }
          >
            {ingest.state.fatalError ?? "Something went wrong."}
          </Alert>
        ) : null}
      </DialogContent>

      <DialogActions
        sx={{
          p: 2,
          gap: 1,
          ...(isMobile && {
            position: "sticky",
            bottom: 0,
            bgcolor: "background.paper",
            borderTop: 1,
            borderColor: "divider",
            zIndex: 1,
          }),
        }}
      >
        <Button onClick={close} disabled={ingest.state.step === "committing"}>
          Close
        </Button>

        {ingest.state.step === "context" && config ? (
          <Button
            variant="contained"
            onClick={() => ingest.goTo("prompt")}
            disabled={
              // Block only when the user has explicitly opted in to recording
              // a site expense but hasn't picked a site yet. The default
              // (undefined) treats company-flow as catalog-only / allow continue,
              // matching ContextPicker's "default toggle off" UX.
              config.mode.startsWith("purchase") &&
              ingest.state.ctx.recordAsSiteExpense === true &&
              !ingest.state.ctx.siteId
            }
          >
            Next: Copy prompt
          </Button>
        ) : null}

        {ingest.state.step === "prompt" ? (
          <>
            <Button onClick={() => ingest.goTo("context")}>Back</Button>
            <Button variant="contained" onClick={() => ingest.goTo("paste")}>
              I have the AI&apos;s response
            </Button>
          </>
        ) : null}

        {ingest.state.step === "paste" ? (
          <Button onClick={() => ingest.goTo("prompt")}>Back to prompt</Button>
        ) : null}

        {ingest.state.step === "preview" ? (
          <>
            <Button onClick={() => ingest.goTo("paste")}>Back</Button>
            <Button variant="contained" onClick={onCommit}>
              Confirm &amp; save
            </Button>
          </>
        ) : null}

        {ingest.state.step === "done" ? (
          <Button variant="contained" onClick={() => ingest.reset()}>
            Ingest another
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
