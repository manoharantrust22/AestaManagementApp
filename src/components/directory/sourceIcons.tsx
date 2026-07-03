"use client";

/**
 * Per-source icon + shared color constants for the Directory feature.
 * Single source of truth for DirectoryCard, DirectoryGridCard and
 * ContactDetailDrawer (previously each kept its own copy).
 */

import React from "react";
import {
  Handyman as HandymanIcon,
  Engineering as EngineeringIcon,
  Storefront as StorefrontIcon,
  Groups as GroupsIcon,
  Sell as SellIcon,
} from "@mui/icons-material";
import type { DirectoryEntry } from "@/types/directory.types";

export const SOURCE_ICON: Record<DirectoryEntry["source"], React.ReactNode> = {
  technician: <HandymanIcon />,
  brand: <SellIcon />,
  laborer: <EngineeringIcon />,
  vendor: <StorefrontIcon />,
  mestri: <GroupsIcon />,
};

/** WhatsApp brand green (their official primary). */
export const WA_GREEN = "#25D366";
