"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
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
  Trade,
  WorkStage,
} from "@/types/trade.types";
import type { TaskWorkPackageWithMeta } from "@/types/taskWork.types";
import { buildWorkspaceModel, findTask } from "@/lib/workforce/workspaceModel";
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
import { RecordPaymentSheet } from "./RecordPaymentSheet";
import { UpdateProgressSheet } from "./UpdateProgressSheet";
import { buildContractScopeHref } from "@/lib/workforce/contractScope";
import { ChangeTrackingModeDialog } from "@/components/trades/ChangeTrackingModeDialog";

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
  onOpenPackage,
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
  onOpenPackage: (pkg: TaskWorkPackageWithMeta) => void;
  onAddTaskWork: (tradeCategoryId: string, stageId: string | null) => void;
}) {
  const router = useRouter();
  const mobile = useMediaQuery(`(max-width:${WS_MOBILE_BREAKPOINT}px)`);

  const model = useMemo(
    () => buildWorkspaceModel({ trades, reconciliations, activity, stages }),
    [trades, reconciliations, activity, stages]
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [openTrades, setOpenTrades] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<null | "payment" | "progress">(null);
  const [modeOpen, setModeOpen] = useState(false);
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
  const notify = (msg: string, severity: "success" | "error" = "success") =>
    setSnack({ open: true, msg, severity });

  const toggleTrade = (categoryId: string) =>
    setOpenTrades((m) => ({ ...m, [categoryId]: !(m[categoryId] ?? false) }));

  const handleSelect = (id: string) => setSelectedTaskId(id);

  const listPane = (
    <ContractListPane
      siteName={siteName}
      model={model}
      openTrades={openTrades}
      onToggleTrade={toggleTrade}
      selectedTaskId={selectedTaskId}
      onSelectTask={handleSelect}
      query={query}
      onQueryChange={setQuery}
      packagesByTrade={packagesByTrade}
      onOpenPackage={onOpenPackage}
      onAddTaskWork={onAddTaskWork}
      onAddClick={(el) => setAddAnchor(el)}
      canEdit={canEdit}
    />
  );

  const detailPane = (
    <TaskDetailPane
      task={selectedTask}
      canEdit={canEdit}
      onUpdateProgress={() => setSheet("progress")}
      onRecordPayment={() => setSheet("payment")}
      onLogAttendance={() =>
        selectedTask && router.push(buildContractScopeHref("/site/attendance", selectedTask))
      }
      onSettleSalary={() =>
        selectedTask && router.push(buildContractScopeHref("/site/payments", selectedTask))
      }
      onChangeMode={() => setModeOpen(true)}
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
        New task work in…
      </Typography>
      {model.trades.map((node) => {
        const Trade = tradeIcon(node.category.name);
        return (
          <MenuItem
            key={node.category.id}
            onClick={() => {
              setAddAnchor(null);
              onAddTaskWork(node.category.id, null);
            }}
          >
            <ListItemIcon>
              <Trade sx={{ fontSize: 20, color: wsColors.ink2 }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{node.category.name}</ListItemText>
          </MenuItem>
        );
      })}
    </Menu>
  );

  const sheets = selectedTask && (
    <>
      <RecordPaymentSheet
        open={sheet === "payment"}
        onClose={() => setSheet(null)}
        siteId={siteId}
        task={selectedTask}
        notify={notify}
      />
      <UpdateProgressSheet
        open={sheet === "progress"}
        onClose={() => setSheet(null)}
        siteId={siteId}
        task={selectedTask}
        notify={notify}
      />
    </>
  );

  // Per-trade Attendance + Salary opt-in (changes labor_tracking_mode). Needs a
  // real trade category; uncategorized rows can't switch mode.
  const modeDialog = selectedTask && selectedTask.tradeCategoryId ? (
    <ChangeTrackingModeDialog
      open={modeOpen}
      onClose={() => setModeOpen(false)}
      contractId={selectedTask.id}
      contractTitle={selectedTask.title}
      currentMode={selectedTask.mode}
      tradeCategoryId={selectedTask.tradeCategoryId}
    />
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
    const showingDetail = !!selectedTask;
    return (
      <Box sx={rootSx}>
        {fontLinks}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", pb: showingDetail ? 0 : 7 }}>
          {showingDetail ? (
            <>
              <Box sx={{ flex: 1, minHeight: 0 }}>{detailPane}</Box>
              {canEdit && (
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
                    variant="outlined"
                    startIcon={<TuneRounded />}
                    onClick={() => setSheet("progress")}
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: `${wsRadius.input}px`, borderColor: wsColors.hairline, color: wsColors.ink2 }}
                  >
                    Progress
                  </Button>
                  <Button
                    fullWidth
                    variant="contained"
                    disableElevation
                    startIcon={<PaymentsRounded />}
                    onClick={() => setSheet("payment")}
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: `${wsRadius.input}px`, bgcolor: wsColors.primary, "&:hover": { bgcolor: "#2a60d6" } }}
                  >
                    Record payment
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
      {snackbar}
    </Box>
  );
}
