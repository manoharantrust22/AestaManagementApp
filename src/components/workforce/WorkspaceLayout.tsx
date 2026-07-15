"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Fab,
  Paper,
  BottomNavigation,
  BottomNavigationAction,
  Skeleton,
  Snackbar,
  Alert,
  Button,
  useMediaQuery,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import Groups from "@mui/icons-material/Groups";
import AccessTime from "@mui/icons-material/AccessTime";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import MoreHoriz from "@mui/icons-material/MoreHoriz";
import TuneRounded from "@mui/icons-material/TuneRounded";
import Handshake from "@mui/icons-material/Handshake";
import type {
  ContractActivity,
  ContractReconciliation,
  ContractStatus,
  Trade,
  WorkStage,
} from "@/types/trade.types";
import type { TaskWorkPackageWithMeta } from "@/types/taskWork.types";
import { buildWorkspaceModel, contractorGroupFromNode, findContractNode, findTask } from "@/lib/workforce/workspaceModel";
import type { WorkspacePackage, WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { DEFAULT_STATUS_TAB, type StatusTab } from "@/lib/workforce/statusTabs";
import {
  WS_MOBILE_BREAKPOINT,
  tradeIcon,
  wsColors,
  wsFont,
  wsRadius,
  wsShadow,
} from "@/lib/workforce/workspaceTokens";
import { ContractListPane } from "./ContractListPane";
import { WorkspaceToggleConfirmDialog } from "./WorkspaceToggleConfirmDialog";
import { useToggleTradeWorkspace } from "@/hooks/mutations/useToggleTradeWorkspace";
import {
  useSiteTradeWorkspaceUsage,
  useSiteTradeMigrationUsage,
} from "@/hooks/queries/useSiteTradeSettings";
import { TaskDetailPane } from "./TaskDetailPane";
import { GroupDetailPane } from "./GroupDetailPane";
import { PackageDetailPane } from "./PackageDetailPane";
import { RecordDrawer } from "./RecordDrawer";
import { buildContractScopeHref } from "@/lib/workforce/contractScope";
import { useMoveSubcontractNode, useUndoMove } from "@/hooks/queries/useMoveSubcontractNode";
import { useEnsureTradeInHouseContract } from "@/hooks/queries/useTradeInHouseContract";
import { ChangeTrackingModeDialog } from "@/components/trades/ChangeTrackingModeDialog";
import { ConvertToPackageDialog } from "@/components/trades/ConvertToPackageDialog";
import { HandToCrewDialog } from "./HandToCrewDialog";
import EditContractDialog from "./EditContractDialog";
import DeleteContractDialog from "./DeleteContractDialog";
import type { AddTaskWork } from "./ContractTree";

export function WorkspaceLayout({
  siteId,
  siteName,
  trades,
  reconciliations,
  activity,
  stages,
  loading,
  canEdit,
  packagesByTrade,
  onEditPackage,
  onAddTaskWork,
}: {
  siteId: string;
  siteName: string;
  trades: Trade[];
  reconciliations: Map<string, ContractReconciliation> | undefined;
  activity: Map<string, ContractActivity> | undefined;
  stages: WorkStage[] | undefined;
  loading: boolean;
  canEdit: boolean;
  packagesByTrade: Map<string, TaskWorkPackageWithMeta[]>;
  /** Opens the package edit dialog (owned by the page). */
  onEditPackage: (pkg: TaskWorkPackageWithMeta) => void;
  onAddTaskWork: AddTaskWork;
}) {
  const router = useRouter();
  const mobile = useMediaQuery(`(max-width:${WS_MOBILE_BREAKPOINT}px)`);

  // Flatten packages (with paid merged on in page.tsx) into the shape the model folds in.
  const packages = useMemo<WorkspacePackage[]>(() => {
    const out: WorkspacePackage[] = [];
    for (const [tradeCatId, pkgs] of packagesByTrade) {
      for (const p of pkgs) {
        out.push({
          id: p.id,
          title: p.title,
          tradeCategoryId: tradeCatId,
          parentSubcontractId: p.parent_subcontract_id,
          who: p.maistry_name ?? "—",
          quoted: Number(p.total_value ?? 0),
          paid: Number(p.paid ?? 0),
          status: p.status as unknown as ContractStatus,
        });
      }
    }
    return out;
  }, [packagesByTrade]);

  // id → package, so a "package" part can open its drawer from the detail pane.
  const pkgById = useMemo(() => {
    const m = new Map<string, TaskWorkPackageWithMeta>();
    for (const pkgs of packagesByTrade.values()) for (const p of pkgs) m.set(p.id, p);
    return m;
  }, [packagesByTrade]);

  const model = useMemo(
    () => buildWorkspaceModel({ trades, reconciliations, activity, stages, packages }),
    [trades, reconciliations, activity, stages, packages]
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // A selected fixed-price package opens IN-PANE (PackageDetailPane), mutually
  // exclusive with a selected contract/section/task. Held by id so edits to the
  // package reflect live (looked up from the fresh pkgById map).
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [openTrades, setOpenTrades] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<StatusTab>(DEFAULT_STATUS_TAB);
  const [recordOpen, setRecordOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [handOpen, setHandOpen] = useState(false);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  // Per-trade workspace toggle (the trades-page shortcut) — runs the payment migration.
  const [toggleWsCtx, setToggleWsCtx] = useState<{ mode: "on" | "off"; tradeCategoryId: string; tradeName: string } | null>(null);
  const [wsUndoBatch, setWsUndoBatch] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: "success" | "error" }>({
    open: false,
    msg: "",
    severity: "success",
  });

  // Auto-open trades that have work, once, on first data load.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || model.trades.length === 0) return;
    const init: Record<string, boolean> = {};
    for (const n of model.trades) {
      if (n.tasks.length > 0 || (packagesByTrade.get(n.category.id)?.length ?? 0) > 0) {
        init[n.category.id] = true;
      }
    }
    setOpenTrades(init);
    didInit.current = true;
  }, [model, packagesByTrade]);

  // Deep-link: /site/trades?package=<id> or ?contract=<id> opens that node once
  // the model has loaded. Used by the attendance sheet's "Contract work" rows to
  // jump straight to the package/contract behind a contract-only day. Read from
  // the URL here (client-only effect) so the page render path stays untouched.
  const didDeepLink = useRef(false);
  useEffect(() => {
    if (didDeepLink.current) return;
    if (typeof window === "undefined" || model.trades.length === 0) return;

    const sp = new URLSearchParams(window.location.search);
    const pkgId = sp.get("package");
    const contractId = sp.get("contract");
    if (!pkgId && !contractId) {
      didDeepLink.current = true;
      return;
    }

    if (pkgId && pkgById.has(pkgId)) {
      setSelectedPackageId(pkgId);
      setSelectedTaskId(null);
      for (const [tradeCatId, pkgs] of packagesByTrade) {
        if (pkgs.some((p) => p.id === pkgId)) {
          setOpenTrades((m) => ({ ...m, [tradeCatId]: true }));
          break;
        }
      }
      didDeepLink.current = true;
      return;
    }

    if (contractId) {
      const found = findContractNode(model, contractId);
      if (found) {
        setSelectedTaskId(contractId);
        setSelectedPackageId(null);
        setOpenTrades((m) => ({ ...m, [found.trade.category.id]: true }));
        didDeepLink.current = true;
      }
    }
    // If a param is present but not yet resolvable (data still loading), leave
    // didDeepLink unset so a later render with fuller data can resolve it.
  }, [model, packagesByTrade, pkgById]);

  const selectedTask = findTask(model, selectedTaskId);
  const selectedNode = findContractNode(model, selectedTaskId);
  // Looked up live so package edits reflect without re-selecting; falls back to
  // null (→ empty pane) if the package is deleted/closed out of the map.
  const selectedPackage = selectedPackageId ? pkgById.get(selectedPackageId) ?? null : null;
  // A selected node WITH children — subcontract children OR attached fixed-price
  // packages — renders the combined "one contract" view (its parts listed below,
  // rollup-aware money). Only a true leaf renders the single-task detail; a
  // package-only section must NOT fall through to the leaf pane, whose own-value
  // math reads ₹0 and mislabels every package payment as "overpaid".
  const containerSelected =
    !!selectedNode &&
    (selectedNode.node.children.length > 0 || selectedNode.node.packages.length > 0);
  const notify = (msg: string, severity: "success" | "error" = "success") =>
    setSnack({ open: true, msg, severity });

  // ── Per-trade attendance / salary entry (ensure in-house contract, then deep-link) ───
  const ensureInHouse = useEnsureTradeInHouseContract(siteId);
  const handleOpenTradeWorkspace = async (
    tradeCategoryId: string,
    tradeName: string,
    base: "/site/attendance" | "/site/payments"
  ) => {
    try {
      const contractId = await ensureInHouse.mutateAsync(tradeCategoryId);
      router.push(
        buildContractScopeHref(base, {
          id: contractId,
          tradeCategoryId,
          tradeName,
          isInHouse: true,
          mode: "detailed",
        })
      );
    } catch (e) {
      notify((e as Error).message || "Couldn't open the workspace", "error");
    }
  };

  // ── Per-trade workspace toggle (shortcut on the trades page) ───────────────
  const { undoBatch: undoWsBatch } = useToggleTradeWorkspace(siteId);
  const { data: wsUsage = [] } = useSiteTradeWorkspaceUsage(siteId);
  const { data: wsMigrationUsage = [] } = useSiteTradeMigrationUsage(siteId);
  // Genuine (non-migration) workspace rows per trade — these hard-lock a workspace ON.
  const genuineUsageByTrade = useMemo(() => {
    const mig = new Map(wsMigrationUsage.map((u) => [u.trade_category_id, u.migration_rows]));
    const m = new Map<string, number>();
    for (const u of wsUsage) {
      m.set(u.trade_category_id, Math.max(0, u.total_workspace_rows - (mig.get(u.trade_category_id) ?? 0)));
    }
    return m;
  }, [wsUsage, wsMigrationUsage]);
  const handleToggleTradeWorkspace = (tradeCategoryId: string, tradeName: string, currentlyOn: boolean) => {
    // Turning OFF is blocked while the trade holds genuine attendance/settlement data.
    if (currentlyOn && (genuineUsageByTrade.get(tradeCategoryId) ?? 0) > 0) {
      notify(`${tradeName} has attendance/settlement data — it can't be switched off here`, "error");
      return;
    }
    setToggleWsCtx({ mode: currentlyOn ? "off" : "on", tradeCategoryId, tradeName });
  };
  const handleUndoWs = async () => {
    const batchId = wsUndoBatch;
    if (!batchId) return;
    setWsUndoBatch(null);
    try {
      await undoWsBatch(batchId);
      notify("Undone — payments back on the contract page");
    } catch (e) {
      notify((e as Error).message || "Couldn't undo", "error");
    }
  };

  // ── Drag-and-drop re-parenting ─────────────────────────────────────────────
  const moveNode = useMoveSubcontractNode(siteId);
  const undoMove = useUndoMove(siteId);
  // The batch id of the last move, so it can be undone in one tap (server-journalled).
  const [moveUndoBatch, setMoveUndoBatch] = useState<string | null>(null);

  const handleMoveNode = async (nodeId: string, newParentId: string | null) => {
    try {
      const batchId = await moveNode.mutateAsync({ nodeId, newParentId });
      if (batchId) {
        setMoveUndoBatch(batchId);
        notify("Moved");
      }
    } catch (e) {
      notify((e as Error).message || "Couldn't move that item", "error");
    }
  };

  const handleUndoMove = async () => {
    const batchId = moveUndoBatch;
    if (!batchId) return;
    setMoveUndoBatch(null);
    try {
      await undoMove.mutateAsync(batchId);
      notify("Move undone");
    } catch (e) {
      notify((e as Error).message || "Couldn't undo the move", "error");
    }
  };

  const toggleTrade = (categoryId: string) =>
    setOpenTrades((m) => ({ ...m, [categoryId]: !(m[categoryId] ?? false) }));

  // One detail pane at a time. Selecting a contract/section/task clears any package.
  const handleSelect = (id: string) => {
    setSelectedTaskId(id);
    setSelectedPackageId(null);
  };
  // Opening a fixed-price package selects it in-pane (clears any task selection).
  const handleOpenPackage = (pkg: TaskWorkPackageWithMeta) => {
    setSelectedPackageId(pkg.id);
    setSelectedTaskId(null);
  };

  const listPane = (
    <ContractListPane
      siteId={siteId}
      siteName={siteName}
      model={model}
      openTrades={openTrades}
      onToggleTrade={toggleTrade}
      selectedTaskId={selectedTaskId}
      onSelectTask={handleSelect}
      query={query}
      onQueryChange={setQuery}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      packagesByTrade={packagesByTrade}
      onOpenPackage={handleOpenPackage}
      onAddTaskWork={onAddTaskWork}
      onMoveNode={canEdit ? handleMoveNode : undefined}
      onAddClick={(el) => setAddAnchor(el)}
      canEdit={canEdit}
      onOpenTradeWorkspace={canEdit ? handleOpenTradeWorkspace : undefined}
      onToggleTradeWorkspace={canEdit ? handleToggleTradeWorkspace : undefined}
    />
  );

  const workspaceToggleDialog = toggleWsCtx ? (
    <WorkspaceToggleConfirmDialog
      open={!!toggleWsCtx}
      mode={toggleWsCtx.mode}
      siteId={siteId}
      tradeCategoryId={toggleWsCtx.tradeCategoryId}
      tradeName={toggleWsCtx.tradeName}
      onClose={() => setToggleWsCtx(null)}
      onDone={(msg, undoBatchId) => {
        notify(msg);
        if (undoBatchId) setWsUndoBatch(undoBatchId);
      }}
    />
  ) : null;

  const detailPane = selectedPackage ? (
    <PackageDetailPane
      pkg={selectedPackage}
      canEdit={canEdit}
      onEdit={onEditPackage}
      showBack={mobile}
      onBack={() => setSelectedPackageId(null)}
    />
  ) : containerSelected && selectedNode ? (
    <GroupDetailPane
      group={contractorGroupFromNode(selectedNode.node)}
      tradeName={selectedNode.trade.category.name}
      canEdit={canEdit}
      onSelectTask={handleSelect}
      onOpenPackage={(id) => {
        const pkg = pkgById.get(id);
        if (pkg) handleOpenPackage(pkg);
      }}
      onRecord={() => setRecordOpen(true)}
      parentMode={{
        parent: selectedNode.node.task,
        title: selectedNode.node.task.title,
        // A Contract's parts are Sections; a Section's parts are Tasks; a node
        // whose only parts are fixed-price packages labels them as such.
        partLabel:
          selectedNode.node.children.length > 0
            ? selectedNode.node.tier === "contract"
              ? "section"
              : "task"
            : "package",
        selfLabel: selectedNode.node.tier,
        onEdit: () => setEditOpen(true),
      }}
      showBack={mobile}
      onBack={() => setSelectedTaskId(null)}
    />
  ) : (
    <TaskDetailPane
      task={selectedTask}
      canEdit={canEdit}
      onRecord={() => setRecordOpen(true)}
      onChangeMode={() => setModeOpen(true)}
      onEdit={() => setEditOpen(true)}
      onDelete={() => setDeleteOpen(true)}
      onConvertToPackage={selectedTask ? () => setConvertOpen(true) : undefined}
      onHandToCrew={
        selectedTask?.status === "draft" ? () => setHandOpen(true) : undefined
      }
      onOpenInDetails={
        selectedTask ? () => router.push(`/site/subcontracts?contractId=${selectedTask.id}`) : undefined
      }
      showBack={mobile}
      onBack={() => setSelectedTaskId(null)}
    />
  );

  const rootSx = {
    fontFamily: wsFont,
    fontVariantNumeric: "tabular-nums",
    height: { xs: "calc(100dvh - 56px)", sm: "calc(100dvh - 64px)" },
    mx: { xs: -1.5, sm: -2, md: -3 },
    mt: { xs: -1.5, sm: -2, md: -3 },
    mb: { xs: -1.5, sm: -2, md: -3 },
    bgcolor: wsColors.canvas,
    display: "flex",
    overflow: "hidden",
    position: "relative" as const,
  };

  const fontLinks = (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
      />
    </>
  );

  if (loading && model.trades.length === 0) {
    return (
      <Box sx={rootSx}>
        {fontLinks}
        <Box sx={{ width: { xs: "100%", md: 400 }, p: 2 }}>
          <Skeleton variant="text" width={180} height={28} />
          <Skeleton variant="rounded" height={64} sx={{ my: 1.5 }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={44} sx={{ mb: 1 }} />
          ))}
        </Box>
      </Box>
    );
  }

  const addMenu = (
    <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}>
      <Typography sx={{ px: 2, py: 0.5, fontSize: 11, fontWeight: 700, color: wsColors.muted }}>
        New contract in…
      </Typography>
      {model.trades.map((node) => {
        const Trade = tradeIcon(node.category.name);
        return (
          <MenuItem
            key={node.category.id}
            onClick={() => {
              setAddAnchor(null);
              onAddTaskWork(
                node.category.id,
                { parentId: null, tier: "contract" },
                activeTab === "future" ? "draft" : "active"
              );
            }}
          >
            <ListItemIcon>
              <Trade sx={{ fontSize: 20, color: wsColors.ink2 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{node.category.name}</ListItemText>
          </MenuItem>
        );
      })}
      <Divider sx={{ my: 0.5 }} />
      <MenuItem
        onClick={() => {
          setAddAnchor(null);
          router.push("/company/settings/trades");
        }}
      >
        <ListItemIcon>
          <TuneRounded sx={{ fontSize: 20, color: wsColors.ink2 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: 14 }}>Manage trades…</ListItemText>
      </MenuItem>
    </Menu>
  );

  const sheets = selectedTask && (
    <RecordDrawer
      open={recordOpen}
      onClose={() => setRecordOpen(false)}
      task={selectedTask}
      siteId={siteId}
      notify={notify}
      packages={
        selectedNode?.node.packages.filter((p) => p.status !== "cancelled") ?? []
      }
      onOpenPackage={(packageId) => {
        const pkg = pkgById.get(packageId);
        if (pkg) {
          setRecordOpen(false);
          handleOpenPackage(pkg);
        }
      }}
      onLogAttendance={() =>
        router.push(buildContractScopeHref("/site/attendance", selectedTask))
      }
      onSettleSalary={() =>
        router.push(buildContractScopeHref("/site/payments", selectedTask))
      }
    />
  );

  // Per-trade Attendance + Salary opt-in (changes labor_tracking_mode). Needs a
  // real trade category; uncategorized rows can't switch mode.
  // Changing tracking mode only makes sense for a trade that runs the workspace
  // (a workspace-off trade has no attendance/salary mode to opt into).
  const modeDialog = selectedTask && selectedTask.tradeCategoryId && selectedTask.hasWorkspace ? (
    <ChangeTrackingModeDialog
      open={modeOpen}
      onClose={() => setModeOpen(false)}
      contractId={selectedTask.id}
      contractTitle={selectedTask.title}
      currentMode={selectedTask.mode}
      tradeCategoryId={selectedTask.tradeCategoryId}
      tradeName={selectedTask.tradeName}
    />
  ) : null;

  // Edit + guarded delete for the selected contract.
  const contractDialogs = selectedTask ? (
    <>
      <EditContractDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        siteId={siteId}
        task={selectedTask}
      />
      <DeleteContractDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        siteId={siteId}
        task={selectedTask}
        onDeleted={() => setSelectedTaskId(null)}
      />
      {/* Standardize a fixed-price task onto the package (Day-Log) experience. On
          success, flip the pane straight to the new package. */}
      <ConvertToPackageDialog
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        subcontractId={selectedTask.id}
        taskTitle={selectedTask.title}
        siteId={siteId}
        onConverted={(pkgId) => {
          setSelectedTaskId(null);
          setSelectedPackageId(pkgId);
          notify("Converted to a fixed-price package");
        }}
      />
      {/* Hand a Future plan (draft) to a crew: activate as a contract, or convert
          to a fixed-price package. */}
      <HandToCrewDialog
        open={handOpen}
        onClose={() => setHandOpen(false)}
        siteId={siteId}
        task={selectedTask}
        onHandedOver={(r) => {
          setHandOpen(false);
          if (r.kind === "package") {
            setSelectedTaskId(null);
            setSelectedPackageId(r.packageId);
            notify("Handed over as a fixed-price package");
          } else {
            // The plan is now Active — keep it selected but move the list to the
            // Active tab so the row doesn't vanish from the Future-filtered list.
            setActiveTab("active");
            notify("Handed to crew — contract is now active");
          }
        }}
      />
    </>
  ) : null;

  const snackbar = (
    <>
      <Snackbar
        open={snack.open}
        autoHideDuration={2800}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: mobile ? "center" : "right" }}
      >
        <Alert
          variant="filled"
          severity={snack.severity}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          sx={{ borderRadius: `${wsRadius.input}px` }}
        >
          {snack.msg}
        </Alert>
      </Snackbar>

      {/* One-tap undo after a re-parent (the move is journalled, so undo is exact). */}
      <Snackbar
        open={!!moveUndoBatch}
        autoHideDuration={6000}
        onClose={() => setMoveUndoBatch(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: mobile ? "center" : "left" }}
        message="Moved"
        action={
          <Button
            size="small"
            onClick={handleUndoMove}
            disabled={undoMove.isPending}
            sx={{ color: "#9ec5ff", textTransform: "none", fontWeight: 800 }}
          >
            Undo
          </Button>
        }
      />

      {/* One-tap undo after turning a workspace on (the migration is journalled). */}
      <Snackbar
        open={!!wsUndoBatch}
        autoHideDuration={6000}
        onClose={() => setWsUndoBatch(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: mobile ? "center" : "left" }}
        message="Workspace on — payments moved"
        action={
          <Button
            size="small"
            onClick={handleUndoWs}
            sx={{ color: "#9ec5ff", textTransform: "none", fontWeight: 800 }}
          >
            Undo
          </Button>
        }
      />
    </>
  );

  // ---- Mobile: single column with screen push ----
  if (mobile) {
    const showingDetail = !!selectedTaskId || !!selectedPackage;
    return (
      <Box sx={rootSx}>
        {fontLinks}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", pb: showingDetail ? 0 : 7 }}>
          {showingDetail ? (
            <>
              <Box sx={{ flex: 1, minHeight: 0 }}>{detailPane}</Box>
              {/* One "Record" button opens the drawer with the node's daily actions. */}
              {canEdit && selectedTask && (
                <Paper
                  elevation={8}
                  sx={{
                    p: 1.25,
                    display: "flex",
                    gap: 1,
                    borderTop: `1px solid ${wsColors.hairline}`,
                  }}
                >
                  <Button
                    fullWidth
                    variant="contained"
                    disableElevation
                    startIcon={selectedTask.status === "draft" ? <Handshake /> : <PaymentsRounded />}
                    onClick={() =>
                      selectedTask.status === "draft" ? setHandOpen(true) : setRecordOpen(true)
                    }
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: `${wsRadius.input}px`, bgcolor: wsColors.primary, "&:hover": { bgcolor: "#2a60d6" } }}
                  >
                    {selectedTask.status === "draft" ? "Hand to crew" : "Record"}
                  </Button>
                </Paper>
              )}
            </>
          ) : (
            listPane
          )}
        </Box>

        {!showingDetail && (
          <>
            {canEdit && (
              <Fab
                onClick={(e) => setAddAnchor(e.currentTarget)}
                sx={{
                  position: "absolute",
                  right: 16,
                  bottom: 72,
                  bgcolor: wsColors.primary,
                  color: "#fff",
                  boxShadow: wsShadow.raised,
                  "&:hover": { bgcolor: "#2a60d6" },
                }}
              >
                <Add />
              </Fab>
            )}
            <Paper
              elevation={0}
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                borderTop: `1px solid ${wsColors.hairline}`,
              }}
            >
              <BottomNavigation
                showLabels
                value={0}
                onChange={(_, v) => {
                  if (v === 1) router.push("/site/attendance");
                  else if (v === 2) router.push("/site/payments");
                  else if (v === 3) router.push("/site/subcontracts");
                }}
              >
                <BottomNavigationAction label="Contracts" icon={<Groups />} />
                <BottomNavigationAction label="Attendance" icon={<AccessTime />} />
                <BottomNavigationAction label="Salary" icon={<PaymentsRounded />} />
                <BottomNavigationAction label="More" icon={<MoreHoriz />} />
              </BottomNavigation>
            </Paper>
          </>
        )}

        {addMenu}
        {sheets}
        {modeDialog}
        {contractDialogs}
        {snackbar}
      </Box>
    );
  }

  // ---- Desktop: two pane ----
  return (
    <Box sx={rootSx}>
      {fontLinks}
      <Box sx={{ width: 400, flexShrink: 0, height: "100%" }}>{listPane}</Box>
      <Box sx={{ flex: 1, minWidth: 0, height: "100%" }}>{detailPane}</Box>
      {addMenu}
      {sheets}
      {modeDialog}
      {contractDialogs}
      {workspaceToggleDialog}
      {snackbar}
    </Box>
  );
}
