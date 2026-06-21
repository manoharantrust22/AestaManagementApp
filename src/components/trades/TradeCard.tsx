"use client";

import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Stack,
  Chip,
  TextField,
  IconButton,
  Tooltip,
  Collapse,
  CircularProgress,
} from "@mui/material";
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  LayersOutlined as StageIcon,
} from "@mui/icons-material";
import type {
  ContractActivity,
  ContractReconciliation,
  Trade,
  TradeContract,
} from "@/types/trade.types";
import {
  TASK_WORK_STATUS_LABEL,
  type TaskWorkPackageWithMeta,
} from "@/types/taskWork.types";
import {
  useWorkStages,
  useAddWorkStage,
  useDeleteWorkStage,
} from "@/hooks/queries/useWorkStages";
import { ExpandableContractRow } from "./ExpandableContractRow";

const inr = (n: number | string | null | undefined) =>
  `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;

interface TradeCardProps {
  trade: Trade;
  siteId: string;
  /** Map<subcontractId, ContractReconciliation> from useSiteTradeReconciliations. */
  reconciliations?: Map<string, ContractReconciliation>;
  /** Map<subcontractId, ContractActivity> from useSiteTradeActivity. */
  activity?: Map<string, ContractActivity>;
  /** Fixed-price task-work packages for this trade (task_work_packages rows). */
  packages?: TaskWorkPackageWithMeta[];
  /** Open a package's detail drawer. */
  onPackageClick?: (pkg: TaskWorkPackageWithMeta) => void;
  /** Currently-expanded contract id (single-expanded across all cards). */
  expandedContractId?: string | null;
  onContractClick?: (contractId: string) => void;
  /** Add a task work — optionally preselecting a stage. */
  onAddClick: (tradeCategoryId: string, stageId?: string | null) => void;
  onContractView?: (contractId: string) => void;
  onContractDelete?: (contractId: string) => void;
}

export function TradeCard({
  trade,
  siteId,
  reconciliations,
  activity,
  packages = [],
  onPackageClick,
  expandedContractId,
  onContractClick,
  onAddClick,
  onContractView,
  onContractDelete,
}: TradeCardProps) {
  const { category, contracts } = trade;

  const { data: stages = [] } = useWorkStages(siteId, category.id);
  const addStage = useAddWorkStage(siteId, category.id);
  const deleteStage = useDeleteWorkStage(siteId, category.id);

  const [showNewStage, setShowNewStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [confirmDeleteStage, setConfirmDeleteStage] = useState<string | null>(
    null
  );

  // Group task works by stage. Known stages keep their order; anything without a
  // (known) stage falls into the "Ungrouped" bucket shown last.
  const { stageGroups, ungrouped } = useMemo(() => {
    const knownStageIds = new Set(stages.map((s) => s.id));
    const byStage = new Map<string, TradeContract[]>();
    const loose: TradeContract[] = [];
    for (const c of contracts) {
      if (c.stageId && knownStageIds.has(c.stageId)) {
        const arr = byStage.get(c.stageId) ?? [];
        arr.push(c);
        byStage.set(c.stageId, arr);
      } else {
        loose.push(c);
      }
    }
    return {
      stageGroups: stages.map((s) => ({ stage: s, items: byStage.get(s.id) ?? [] })),
      ungrouped: loose,
    };
  }, [stages, contracts]);

  const hasAnything =
    contracts.length > 0 || stages.length > 0 || packages.length > 0;

  const handleCreateStage = async () => {
    const name = newStageName.trim();
    if (!name) return;
    await addStage.mutateAsync({ name, sortOrder: stages.length });
    setNewStageName("");
    setShowNewStage(false);
  };

  const renderRows = (items: TradeContract[]) =>
    items.map((c) => (
      <ExpandableContractRow
        key={c.id}
        contract={c}
        reconciliation={reconciliations?.get(c.id)}
        activity={activity?.get(c.id)}
        expanded={expandedContractId === c.id}
        onToggleExpand={() => onContractClick?.(c.id)}
        onView={onContractView ? () => onContractView(c.id) : undefined}
        onDelete={
          onContractDelete && !c.isInHouse ? () => onContractDelete(c.id) : undefined
        }
      />
    ));

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <CardContent
        sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.25 }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            {category.name}
          </Typography>
          {!category.isActive && (
            <Chip label="Inactive" size="small" variant="outlined" color="default" />
          )}
        </Box>

        {!hasAnything && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              py: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No task work yet
            </Typography>
          </Box>
        )}

        {/* Stage groups */}
        {stageGroups.map(({ stage, items }) => (
          <Box key={stage.id}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                mb: 0.5,
              }}
            >
              <StageIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                {stage.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {items.length}
              </Typography>
              {confirmDeleteStage === stage.id ? (
                <Tooltip title="Tap again to delete this stage (task work stays, just ungrouped)">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      void deleteStage.mutateAsync(stage.id);
                      setConfirmDeleteStage(null);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title="Delete stage">
                  <IconButton
                    size="small"
                    onClick={() => setConfirmDeleteStage(stage.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            {items.length > 0 ? (
              <Stack spacing={1} sx={{ pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
                {renderRows(items)}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                No task work in this stage yet
              </Typography>
            )}
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => onAddClick(category.id, stage.id)}
              sx={{ mt: 0.5 }}
            >
              Add task work
            </Button>
          </Box>
        ))}

        {/* Ungrouped task work (no stage) */}
        {ungrouped.length > 0 && (
          <Box>
            {stages.length > 0 && (
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                Ungrouped
              </Typography>
            )}
            <Stack spacing={1}>{renderRows(ungrouped)}</Stack>
          </Box>
        )}

        {/* Fixed-price task-work packages (task_work_packages — distinct module) */}
        {packages.length > 0 && (
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              Fixed-price packages
            </Typography>
            <Stack spacing={0.75}>
              {packages.map((p) => (
                <Box
                  key={p.id}
                  onClick={() => onPackageClick?.(p)}
                  sx={{
                    p: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {p.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {p.maistry_name ?? "—"}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {inr(p.total_value)}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={TASK_WORK_STATUS_LABEL[p.status]}
                        sx={{ height: 18, fontSize: 10 }}
                      />
                    </Box>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* New-stage inline create */}
        <Collapse in={showNewStage}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            <TextField
              size="small"
              label="New stage"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="e.g. First Floor"
              fullWidth
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateStage();
              }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleCreateStage}
              disabled={addStage.isPending || !newStageName.trim()}
              startIcon={addStage.isPending ? <CircularProgress size={14} /> : null}
            >
              Add
            </Button>
            <Button
              size="small"
              onClick={() => {
                setShowNewStage(false);
                setNewStageName("");
              }}
            >
              Cancel
            </Button>
          </Stack>
        </Collapse>

        {/* Card actions */}
        <Stack direction="row" spacing={1} sx={{ mt: "auto", pt: 0.5 }}>
          {!showNewStage && (
            <Button
              startIcon={<StageIcon />}
              size="small"
              onClick={() => setShowNewStage(true)}
            >
              Add stage
            </Button>
          )}
          <Button
            startIcon={<AddIcon />}
            size="small"
            variant="contained"
            onClick={() => onAddClick(category.id, null)}
          >
            Add task work
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
