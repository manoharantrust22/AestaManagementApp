"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Check as CopiedIcon,
  ContentCopy as CopyIcon,
  WarningAmberOutlined as WarnIcon,
} from "@mui/icons-material";

import type { SpaceType } from "@/types/spaces.types";
import { DIMENSION_LABELS, SPACE_TYPE_LABELS } from "@/types/spaces.types";
import {
  useCreateSpacesBulk,
  useSpaces,
  useSpaceSections,
} from "@/hooks/queries/useSpaces";
import { filterFloorSections } from "@/lib/spaces/floors";
import {
  computeQuantities,
  rollupTotals,
} from "@/lib/spaces/measurements";
import {
  buildSpacesImportPrompt,
  draftSpaceFromRow,
  parseSpacesImport,
  rowToSpaceInsert,
  type ImportRow,
  type ParseSpacesResult,
} from "@/lib/spaces/importSpaces";
import FeetInchesField from "./FeetInchesField";
import FloorSelect from "./FloorSelect";

interface SpacesImportDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
}

const STEPS = ["Copy prompt", "Paste result", "Preview & add"];

/**
 * "Import from plan": the app builds a prompt, the owner runs it with the
 * floor-plan image in his own ChatGPT/Gemini/Claude (no API key needed),
 * pastes the JSON back and reviews an editable preview before one bulk save.
 */
export default function SpacesImportDialog({
  open,
  onClose,
  siteId,
}: SpacesImportDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { data: sections = [] } = useSpaceSections(siteId);
  const { data: existingSpaces = [] } = useSpaces(siteId);
  const createBulk = useCreateSpacesBulk();

  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<ParseSpacesResult | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setCopied(false);
    setPasted("");
    setResult(null);
    setRows([]);
    setCommitError(null);
  }, [open]);

  const prompt = useMemo(
    () =>
      buildSpacesImportPrompt({
        floorNames: filterFloorSections(sections, {}).map((s) => s.name),
      }),
    [sections]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable — the prompt stays selectable below.
    }
  };

  const handleParse = () => {
    const parsed = parseSpacesImport(
      pasted,
      sections,
      existingSpaces.map((s) => s.name)
    );
    setResult(parsed);
    if (!parsed.error && parsed.rows.length > 0) {
      setRows(parsed.rows);
      setStep(2);
    }
  };

  const updateRow = (key: string, patch: Partial<ImportRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const included = rows.filter((r) => r.include);
  const totals = useMemo(
    () =>
      rollupTotals(
        included.map((r) => draftSpaceFromRow(r, siteId)),
        "drawing"
      ),
    [included, siteId]
  );

  const handleCommit = async () => {
    setCommitError(null);
    try {
      await createBulk.mutateAsync({
        siteId,
        inputs: included.map((r, i) => rowToSpaceInsert(r, siteId, i)),
      });
      onClose();
    } catch (e) {
      const message =
        (e as { message?: string } | null)?.message || "Failed to add spaces";
      setCommitError(message);
    }
  };

  const saving = createBulk.isPending;

  const rowQuantities = (row: ImportRow) =>
    computeQuantities(draftSpaceFromRow(row, siteId), "drawing");

  const openingsSummary = (row: ImportRow) => {
    const doors = row.openings.filter((o) => o.kind === "door");
    const windows = row.openings.filter((o) => o.kind === "window");
    const doorCount = doors.reduce((s, o) => s + o.count, 0);
    const windowCount = windows.reduce((s, o) => s + o.count, 0);
    return `${doorCount}D ${windowCount}W`;
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth={step === 2 ? "lg" : "sm"}
      fullScreen={step === 2 && isMobile}
    >
      <DialogTitle>Import spaces from the floor plan</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 2 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === 0 && (
          <Stack spacing={1.5}>
            <Alert severity="info">
              1. Copy this prompt. 2. Open{" "}
              <Link href="https://chat.openai.com/" target="_blank" rel="noopener noreferrer">
                ChatGPT
              </Link>
              ,{" "}
              <Link href="https://gemini.google.com/" target="_blank" rel="noopener noreferrer">
                Gemini
              </Link>{" "}
              or Claude and paste it <strong>along with the floor-plan image or PDF</strong>.
              3. Copy the JSON it returns and paste it in the next step.
            </Alert>
            <Paper
              variant="outlined"
              sx={{ p: 1.5, maxHeight: 300, overflow: "auto", bgcolor: "action.hover" }}
            >
              <Typography
                component="pre"
                variant="caption"
                sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace", m: 0 }}
              >
                {prompt}
              </Typography>
            </Paper>
            <Button
              variant="contained"
              startIcon={copied ? <CopiedIcon /> : <CopyIcon />}
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy prompt"}
            </Button>
          </Stack>
        )}

        {step === 1 && (
          <Stack spacing={1.5}>
            <TextField
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              multiline
              minRows={10}
              maxRows={18}
              fullWidth
              placeholder={'Paste the AI\'s response here — including the ```json block.'}
              slotProps={{
                input: { sx: { fontFamily: "monospace", fontSize: 13 } },
              }}
            />
            {result?.error && <Alert severity="error">{result.error}</Alert>}
            {result && !result.error && result.rows.length === 0 && (
              <Alert severity="error">
                No usable rooms found.
                {result.rowErrors.length > 0 &&
                  ` ${result.rowErrors.length} row(s) had problems — fix the JSON and paste again.`}
              </Alert>
            )}
          </Stack>
        )}

        {step === 2 && (
          <Stack spacing={1.5}>
            {result?.source !== "fenced" && (
              <Alert severity="info">
                The JSON was extracted from surrounding text — double-check the
                rows below.
              </Alert>
            )}
            {result && result.rowErrors.length > 0 && (
              <Alert severity="warning">
                {result.rowErrors.length} row(s) could not be read and were
                skipped:{" "}
                {result.rowErrors
                  .map((e) => `Row ${e.index + 1}${e.name ? ` (${e.name})` : ""}: ${e.issues[0]}`)
                  .join(" · ")}
              </Alert>
            )}

            {isMobile ? (
              <Stack spacing={1.5}>
                {rows.map((row) => {
                  const q = rowQuantities(row);
                  return (
                    <Paper key={row.key} variant="outlined" sx={{ p: 1.5, opacity: row.include ? 1 : 0.5 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Checkbox
                            checked={row.include}
                            onChange={(e) => updateRow(row.key, { include: e.target.checked })}
                            size="small"
                            sx={{ p: 0.5 }}
                          />
                          <TextField
                            value={row.name}
                            onChange={(e) => updateRow(row.key, { name: e.target.value })}
                            size="small"
                            sx={{ flex: 1 }}
                          />
                          {row.warnings.length > 0 && (
                            <Tooltip title={row.warnings.join(" ")}>
                              <WarnIcon fontSize="small" color="warning" />
                            </Tooltip>
                          )}
                        </Stack>
                        <Stack direction="row" spacing={1}>
                          <TextField
                            select
                            label="Type"
                            size="small"
                            value={row.type}
                            onChange={(e) => updateRow(row.key, { type: e.target.value as SpaceType })}
                            sx={{ flex: 1 }}
                          >
                            {(Object.keys(SPACE_TYPE_LABELS) as SpaceType[]).map((t) => (
                              <MenuItem key={t} value={t}>
                                {SPACE_TYPE_LABELS[t]}
                              </MenuItem>
                            ))}
                          </TextField>
                          <FloorSelect
                            siteId={siteId}
                            value={row.sectionId}
                            onChange={(v) => updateRow(row.key, { sectionId: v })}
                            allowNone
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <Stack direction="row" spacing={1}>
                          <FeetInchesField
                            label={DIMENSION_LABELS.x}
                            value={row.xIn}
                            onChange={(v) => v !== null && updateRow(row.key, { xIn: v })}
                            sx={{ flex: 1 }}
                          />
                          <FeetInchesField
                            label={DIMENSION_LABELS.y}
                            value={row.yIn}
                            onChange={(v) => v !== null && updateRow(row.key, { yIn: v })}
                            sx={{ flex: 1 }}
                          />
                          <FeetInchesField
                            label={DIMENSION_LABELS.h}
                            value={row.hIn}
                            onChange={(v) => updateRow(row.key, { hIn: v })}
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                          <Chip size="small" variant="outlined" label={openingsSummary(row)} />
                          {row.wallTileEnabled && (
                            <Chip size="small" variant="outlined" color="info" label="Wall tile 7'" />
                          )}
                          <Box sx={{ flex: 1 }} />
                          <Typography variant="caption" sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {q.floorTileSqft} sqft · {q.skirtingRft} rft
                          </Typography>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: "52vh" }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Floor</TableCell>
                      <TableCell>{DIMENSION_LABELS.x}</TableCell>
                      <TableCell>{DIMENSION_LABELS.y}</TableCell>
                      <TableCell>{DIMENSION_LABELS.h}</TableCell>
                      <TableCell align="center">Openings</TableCell>
                      <TableCell align="right">Floor sqft</TableCell>
                      <TableCell align="right">Skirting rft</TableCell>
                      <TableCell padding="checkbox" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => {
                      const q = rowQuantities(row);
                      return (
                        <TableRow key={row.key} sx={{ opacity: row.include ? 1 : 0.45 }}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={row.include}
                              onChange={(e) => updateRow(row.key, { include: e.target.checked })}
                              size="small"
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 140 }}>
                            <TextField
                              value={row.name}
                              onChange={(e) => updateRow(row.key, { name: e.target.value })}
                              size="small"
                              variant="standard"
                              fullWidth
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 110 }}>
                            <TextField
                              select
                              value={row.type}
                              onChange={(e) => updateRow(row.key, { type: e.target.value as SpaceType })}
                              size="small"
                              variant="standard"
                              fullWidth
                            >
                              {(Object.keys(SPACE_TYPE_LABELS) as SpaceType[]).map((t) => (
                                <MenuItem key={t} value={t}>
                                  {SPACE_TYPE_LABELS[t]}
                                </MenuItem>
                              ))}
                            </TextField>
                          </TableCell>
                          <TableCell sx={{ minWidth: 140 }}>
                            <FloorSelect
                              siteId={siteId}
                              value={row.sectionId}
                              onChange={(v) => updateRow(row.key, { sectionId: v })}
                              allowNone
                              label=""
                              sx={{ width: "100%" }}
                            />
                          </TableCell>
                          <TableCell sx={{ width: 96 }}>
                            <FeetInchesField
                              label=""
                              value={row.xIn}
                              onChange={(v) => v !== null && updateRow(row.key, { xIn: v })}
                            />
                          </TableCell>
                          <TableCell sx={{ width: 96 }}>
                            <FeetInchesField
                              label=""
                              value={row.yIn}
                              onChange={(v) => v !== null && updateRow(row.key, { yIn: v })}
                            />
                          </TableCell>
                          <TableCell sx={{ width: 96 }}>
                            <FeetInchesField
                              label=""
                              value={row.hIn}
                              onChange={(v) => updateRow(row.key, { hIn: v })}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip
                              title={row.openings
                                .map(
                                  (o) =>
                                    `${o.kind === "door" ? "Door" : "Window"} ${Math.round(o.width_in / 12 * 100) / 100}' × ${Math.round(o.height_in / 12 * 100) / 100}' ×${o.count}`
                                )
                                .join(", ") || "None"}
                            >
                              <Chip size="small" variant="outlined" label={openingsSummary(row)} />
                            </Tooltip>
                            {row.wallTileEnabled && (
                              <Chip size="small" variant="outlined" color="info" label="Wall" sx={{ ml: 0.5 }} />
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {q.floorTileSqft}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {q.skirtingRft}
                          </TableCell>
                          <TableCell padding="checkbox">
                            {row.warnings.length > 0 && (
                              <Tooltip title={row.warnings.join(" ")}>
                                <IconButton size="small">
                                  <WarnIcon fontSize="small" color="warning" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
              <strong>{included.length}</strong> room{included.length === 1 ? "" : "s"} ·{" "}
              {totals.grand.floorTileSqft} sqft floor · {totals.grand.skirtingRft} rft skirting
              {totals.grand.wallTileSqft > 0 && <> · {totals.grand.wallTileSqft} sqft wall</>}
              {totals.grand.graniteSqft > 0 && <> · {totals.grand.graniteSqft} sqft granite</>}
            </Typography>

            {commitError && <Alert severity="error">{commitError}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        {step > 0 && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={saving}>
            Back
          </Button>
        )}
        {step === 0 && (
          <Button variant="contained" onClick={() => setStep(1)}>
            I have the JSON
          </Button>
        )}
        {step === 1 && (
          <Button
            variant="contained"
            onClick={handleParse}
            disabled={!pasted.trim()}
          >
            Parse & preview
          </Button>
        )}
        {step === 2 && (
          <Button
            variant="contained"
            onClick={handleCommit}
            disabled={saving || included.length === 0}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}
          >
            Add {included.length} space{included.length === 1 ? "" : "s"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
