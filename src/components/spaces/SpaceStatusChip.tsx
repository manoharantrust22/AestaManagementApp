"use client";

import React from "react";
import { Chip } from "@mui/material";
import {
  HelpOutline as UnverifiedIcon,
  ReportProblemOutlined as VarianceIcon,
  VerifiedOutlined as VerifiedIcon,
} from "@mui/icons-material";

import type { SpaceStatus } from "@/types/spaces.types";

const statusConfig: Record<
  SpaceStatus,
  {
    icon: React.ReactElement;
    color: "default" | "success" | "warning";
    label: string;
  }
> = {
  unverified: {
    icon: <UnverifiedIcon />,
    color: "default",
    label: "Unverified",
  },
  verified: { icon: <VerifiedIcon />, color: "success", label: "Verified" },
  variance: { icon: <VarianceIcon />, color: "warning", label: "Variance" },
};

export default function SpaceStatusChip({
  status,
  size = "small",
}: {
  status: SpaceStatus;
  size?: "small" | "medium";
}) {
  const config = statusConfig[status];
  return (
    <Chip
      icon={config.icon}
      label={config.label}
      color={config.color}
      size={size}
      variant={status === "unverified" ? "outlined" : "filled"}
    />
  );
}
