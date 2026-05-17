"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  CircularProgress,
  Box,
  IconButton,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DomainRoundedIcon from "@mui/icons-material/DomainRounded";
import { useSitesData } from "@/contexts/SiteContext/SitesDataContext";

interface SitePickerForMRProps {
  open: boolean;
  onClose: () => void;
  onSiteSelected: (siteId: string) => void;
}

export default function SitePickerForMR({
  open,
  onClose,
  onSiteSelected,
}: SitePickerForMRProps) {
  const { sites, loading } = useSitesData();

  const activeSites = sites.filter(
    (s) => s.status === "active" || s.status === "planning"
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
        }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          Select a Site
        </Typography>
        <IconButton size="small" onClick={onClose} edge="end">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 0, pb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose the site for which you want to create the Material Request.
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : activeSites.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ py: 3 }}
          >
            No active sites found.
          </Typography>
        ) : (
          <List disablePadding>
            {activeSites.map((site) => (
              <ListItemButton
                key={site.id}
                onClick={() => onSiteSelected(site.id)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  border: "1px solid",
                  borderColor: "divider",
                  "&:hover": { borderColor: "primary.main", bgcolor: "primary.50" },
                }}
              >
                <DomainRoundedIcon
                  sx={{ mr: 1.5, color: "text.secondary", fontSize: 20 }}
                />
                <ListItemText
                  primary={site.name}
                  primaryTypographyProps={{ fontWeight: 500, fontSize: "0.875rem" }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
