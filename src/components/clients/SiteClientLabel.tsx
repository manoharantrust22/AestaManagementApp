"use client";

import React from "react";
import { Stack, Typography } from "@mui/material";
import { useSiteClients } from "@/hooks/queries/useSiteClients";
import ClientAvatar from "./ClientAvatar";

export interface SiteClientLabelProps {
  siteId: string;
  clientId: string | null | undefined;
  /** Shown when the client isn't on the roster (removed, or legacy free text). */
  fallbackName?: string | null;
  size?: number;
}

/** Compact avatar + name for table cells. Renders "—" when there's nothing to show. */
export function SiteClientLabel({ siteId, clientId, fallbackName, size = 22 }: SiteClientLabelProps) {
  const { data: clients = [] } = useSiteClients(siteId);
  const client = clientId ? clients.find((c) => c.id === clientId) : undefined;
  const name = client?.name ?? fallbackName ?? null;
  if (!name) return <>—</>;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" component="span" sx={{ display: "inline-flex", maxWidth: "100%" }}>
      <ClientAvatar name={name} photoUrl={client?.photo_url} size={size} />
      <Typography variant="body2" component="span" noWrap>{name}</Typography>
    </Stack>
  );
}

export default SiteClientLabel;
