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
import { TaskDetailPane } from "./TaskDetailPane";
import { GroupDetailPane } from "./GroupDetailPane";
import { PackageDetailPane } from "./PackageDetailPane";
import { RecordDrawer } from "./RecordDrawer";
import { buildContractScopeHref } from "@/lib/workforce/contractScope";
import { ChangeTrackingModeDialog } from "@/components/trades/ChangeTrackingModeDialog";
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
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
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

  const selectedTask = findTask(model, selectedTaskId);
  const selectedNode = findContractNode(model, selectedTaskId);
  // Looked up live so package edits reflect without re-selecting; falls back to
  // null (→ empty pane) if the package is deleted/closed out of the map.
  const selectedPackage = selectedPackageId ? pkgById.get(selectedPackageId) ?? null : null;
  // A selected node WITH children renders the combined "one contract" view (its parts
  // listed below); a leaf renders the single-task detail.
  const containerSelected = !!selectedNode && selectedNode.node.children.length > 0;
  const notify = (msg: string, severity: "success" | "error" = "success") =>
    setSnack({ open: true, msg, severity });

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
      onAddClick={(el) => setAddAnchor(el)}
      canEdit={canEdit}
    />
  );

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
        // A Contract's parts are Sections; a Section's parts are Tasks.
        partLabel: selectedNode.node.tier === "contract" ? "section" : "task",
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
    </>
  ) : null;

  const snackbar = (
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
                    startIcon={<PaymentsRounded />}
                    onClick={() => setRecordOpen(true)}
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: `${wsRadius.input}px`, bgcolor: wsColors.primary, "&:hover": { bgcolor: "#2a60d6" } }}
                  >
                    Record
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
      {snackbar}
    </Box>
  );
}
