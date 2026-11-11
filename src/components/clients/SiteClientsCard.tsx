"use client";

import React, { useState } from "react";
import {
  Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography, Skeleton,
} from "@mui/material";
import { DeleteOutline, EditOutlined, PersonAddAlt1, Phone } from "@mui/icons-material";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import {
  useSiteClients,
  useRemoveSiteClient,
  type SiteClient,
} from "@/hooks/queries/useSiteClients";
import ClientAvatar from "./ClientAvatar";
import SiteClientFormDialog from "./SiteClientFormDialog";

export interface SiteClientsCardProps {
  siteId: string;
}

/** The site's client roster — the list every client picker on this site selects from. */
export function SiteClientsCard({ siteId }: SiteClientsCardProps) {
  const { data: clients = [], isLoading } = useSiteClients(siteId);
  const remove = useRemoveSiteClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SiteClient | undefined>(undefined);
  const [removing, setRemoving] = useState<SiteClient | null>(null);

  const openForm = (c?: SiteClient) => {
    setEditing(c);
    setFormOpen(true);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
            Clients ({clients.length})
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            People you can pick for approvals and payments on this site.
          </Typography>
        </Box>
        <Button size="small" startIcon={<PersonAddAlt1 />} onClick={() => openForm()}>
          Add client
        </Button>
      </Stack>

      {isLoading ? (
        <Stack direction="row" spacing={1.5}>
          <Skeleton variant="circular" width={40} height={40} />
          <Skeleton variant="text" width={160} />
        </Stack>
      ) : clients.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No clients yet. Add the owner and anyone else who approves work or pays.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {clients.map((c) => (
            <Stack
              key={c.linkId}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{ py: 0.5 }}
            >
              <ClientAvatar name={c.name} photoUrl={c.photo_url} size={40} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{c.name}</Typography>
                  {c.is_primary && <Chip size="small" label="Primary" color="primary" variant="outlined" />}
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {[c.role, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                </Typography>
              </Box>
              {c.phone && (
                <Tooltip title={`Call ${c.phone}`}>
                  <IconButton size="small" component="a" href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}>
                    <Phone fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => openForm(c)} aria-label={`Edit ${c.name}`}>
                  <EditOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove from site">
                <IconButton size="small" onClick={() => setRemoving(c)} aria-label={`Remove ${c.name}`}>
                  <DeleteOutline fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      )}

      <SiteClientFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        siteId={siteId}
        initial={editing}
        defaultPrimary={clients.length === 0}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove client from site?"
        message={
          removing
            ? `${removing.name} will no longer appear in this site's client lists. Past approvals and payments keep their name.`
            : ""
        }
        confirmText="Remove"
        confirmColor="error"
        isLoading={remove.isPending}
        onConfirm={async () => {
          if (!removing) return;
          await remove.mutateAsync({ siteId, linkId: removing.linkId });
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </Paper>
  );
}

export default SiteClientsCard;
