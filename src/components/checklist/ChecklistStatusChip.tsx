"use client";

import { Chip, Tooltip } from "@mui/material";
import {
  CheckCircle,
  WatchLater,
  ErrorOutline,
  RadioButtonUnchecked,
  RemoveCircleOutline,
  EventRepeat,
} from "@mui/icons-material";
import { STATUS_META, type ChecklistStatus } from "@/types/checklist.types";

const ICONS: Record<ChecklistStatus, React.ReactNode> = {
  on_time: <CheckCircle fontSize="small" />,
  deferred_done: <CheckCircle fontSize="small" />,
  late: <WatchLater fontSize="small" />,
  deferred_pending: <EventRepeat fontSize="small" />,
  missed: <ErrorOutline fontSize="small" />,
  pending: <RadioButtonUnchecked fontSize="small" />,
  na: <RemoveCircleOutline fontSize="small" />,
};

export default function ChecklistStatusChip({
  status,
  size = "small",
  tooltip,
  showIcon = true,
}: {
  status: ChecklistStatus;
  size?: "small" | "medium";
  tooltip?: string;
  showIcon?: boolean;
}) {
  const meta = STATUS_META[status];
  const chip = (
    <Chip
      size={size}
      color={meta.color}
      variant={status === "pending" || status === "na" ? "outlined" : "filled"}
      icon={showIcon ? (ICONS[status] as React.ReactElement) : undefined}
      label={meta.label}
      sx={{ fontWeight: 600 }}
    />
  );
  return tooltip ? (
    <Tooltip title={tooltip} arrow>
      <span>{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}
