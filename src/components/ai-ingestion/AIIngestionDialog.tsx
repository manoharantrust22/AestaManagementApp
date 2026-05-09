/**
 * Shared shell for AI-assisted catalog ingestion (Purchase / Quotation / Warranty).
 *
 * Mode-specific behavior (prompt template, Zod schema, fuzzy match, commit RPC)
 * is supplied via the `MODE_REGISTRY` lookup; this shell stays mode-agnostic.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { Close as CloseIcon, Refresh as RefreshIcon } from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";

import type { IngestionMode, IngestionStep } from "@/lib/ai-ingestion/types";
import { useAIIngestion } from "@/hooks/useAIIngestion";
import { useIsMobile } from "@/hooks/useIsMobile";
import { buildModeRegistry } from "@/lib/ai-ingestion/modes";

import ModeSelector from "./ModeSelector";
import ContextPicker from "./ContextPicker";
import PromptCopyPanel from "./PromptCopyPanel";
import PasteAndParse from "./PasteAndParse";
import PreviewTable from "./PreviewTable";
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
          <Stepper
            activeStep={activeStepIdx}
            alternativeLabel={!isMobile}
            orientation={isMobile ? "vertical" : "horizontal"}
            sx={{ mb: 3 }}
          >
            {visibleSteps.map((s) => (
              <Step key={s.key}>
                <StepLabel>{s.label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        ) : null}

        {ingest.state.step === "mode" ? (
          <ModeSelector selected={activeMode} onSelect={ingest.setMode} />
        ) : null}

        {ingest.state.step === "context" && config ? (
          <ContextPicker
            mode={config.mode}
            ctx={ingest.state.ctx}
            onChange={ingest.setContext}
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
          <PreviewTable
            preview={ingest.state.preview}
            summary={config.summary(ingest.state.parsed)}
            onPatch={ingest.patchPreview}
          />
        ) : null}

        {ingest.state.step === "committing" && ingest.state.commitState ? (
          <CommitProgress state={ingest.state.commitState} />
        ) : null}

        {ingest.state.step === "done" ? (
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

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={close} disabled={ingest.state.step === "committing"}>
          Close
        </Button>

        {ingest.state.step === "context" && config ? (
          <Button
            variant="contained"
            onClick={() => ingest.goTo("prompt")}
            disabled={!ingest.state.ctx.siteId && config.mode === "purchase"}
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
