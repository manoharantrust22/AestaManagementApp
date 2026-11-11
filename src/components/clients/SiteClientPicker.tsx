"use client";

import React, { useMemo, useState } from "react";
import {
  Autocomplete, Box, TextField, Typography, createFilterOptions, InputAdornment,
} from "@mui/material";
import { PersonAddAlt1 } from "@mui/icons-material";
import { useSiteClients, type SiteClient } from "@/hooks/queries/useSiteClients";
import ClientAvatar from "./ClientAvatar";
import SiteClientFormDialog from "./SiteClientFormDialog";

type AddOption = { kind: "add"; name: string };
type Option = SiteClient | AddOption;

const isAdd = (o: Option): o is AddOption => (o as AddOption).kind === "add";

const filter = createFilterOptions<SiteClient>({
  stringify: (c) => `${c.name} ${c.role ?? ""} ${c.phone ?? ""}`,
});

export interface SiteClientPickerProps {
  siteId: string;
  /** Selected `clients.id`. */
  value: string | null;
  onChange: (client: SiteClient | null) => void;
  label?: string;
  /**
   * Name to show when `value` isn't on the site's roster any more (client was
   * removed) or for legacy rows that only stored free text.
   */
  fallbackName?: string | null;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

/**
 * Pick one of the current site's clients (with photo), or add a new one
 * inline. Use anywhere the app asks "which client?".
 */
export function SiteClientPicker({
  siteId, value, onChange, label = "Client", fallbackName, helperText, disabled, fullWidth = true,
}: SiteClientPickerProps) {
  const { data: clients = [], isLoading } = useSiteClients(siteId);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");

  const selected: SiteClient | null = useMemo(() => {
    if (!value) return null;
    const found = clients.find((c) => c.id === value);
    if (found) return found;
    // Referenced client no longer on this site's roster — keep showing who it was.
    return {
      id: value, linkId: "", name: fallbackName || "Removed client",
      phone: null, email: null, photo_url: null, role: null, is_primary: false,
    };
  }, [value, clients, fallbackName]);

  const legacyHint =
    !value && fallbackName ? `Previously typed: "${fallbackName}" — pick the matching client` : undefined;

  return (
    <>
      <Autocomplete<Option, false, false, false>
        fullWidth={fullWidth}
        disabled={disabled}
        loading={isLoading}
        options={clients}
        value={selected}
        isOptionEqualToValue={(o, v) => !isAdd(o) && !isAdd(v) && o.id === v.id}
        getOptionLabel={(o) => (isAdd(o) ? o.name : o.name)}
        filterOptions={(opts, state) => {
          const matches = filter(opts.filter((o): o is SiteClient => !isAdd(o)), state);
          const typed = state.inputValue.trim();
          const add: AddOption = { kind: "add", name: typed };
          return [...matches, add];
        }}
        onChange={(_e, v) => {
          if (v && isAdd(v)) {
            setAddName(v.name);
            setAddOpen(true);
            return;
          }
          onChange(v ?? null);
        }}
        slotProps={{ popper: { disablePortal: false } }}
        noOptionsText="No clients on this site yet"
        renderOption={(props, o) => {
          const { key, ...rest } = props as typeof props & { key: React.Key };
          if (isAdd(o)) {
            return (
              <Box component="li" key="__add" {...rest} sx={{ gap: 1.5, color: "primary.main", borderTop: clients.length ? 1 : 0, borderColor: "divider" }}>
                <PersonAddAlt1 fontSize="small" />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {o.name ? `Add "${o.name}" as a new client` : "Add new client"}
                </Typography>
              </Box>
            );
          }
          return (
            <Box component="li" key={key} {...rest} sx={{ gap: 1.5 }}>
              <ClientAvatar name={o.name} photoUrl={o.photo_url} size={32} />
              <Box component="span" sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <Typography variant="body2" component="span" noWrap sx={{ fontWeight: 600 }}>
                  {o.name}
                </Typography>
                {(o.role || o.phone) && (
                  <Typography variant="caption" component="span" color="text.secondary" noWrap>
                    {[o.role, o.phone].filter(Boolean).join(" · ")}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={clients.length ? "Select client" : "Add a client"}
            helperText={legacyHint ?? helperText}
            InputProps={{
              ...params.InputProps,
              startAdornment: selected ? (
                <InputAdornment position="start" sx={{ ml: 0.5 }}>
                  <ClientAvatar name={selected.name} photoUrl={selected.photo_url} size={28} />
                </InputAdornment>
              ) : params.InputProps.startAdornment,
            }}
          />
        )}
      />
      <SiteClientFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        siteId={siteId}
        initialName={addName}
        defaultPrimary={clients.length === 0}
        onSaved={(c) => onChange(c)}
      />
    </>
  );
}

export default SiteClientPicker;
