"use client";

import { useState } from "react";
import {
  Button,
  CircularProgress,
  Alert,
  Box,
  Typography,
  Chip,
  Paper,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Tooltip,
} from "@mui/material";
import {
  Download as DownloadIcon,
  CheckCircle as CheckIcon,
  LinkRounded as LookupIcon,
} from "@mui/icons-material";
import { MassUploadTableName } from "@/types/mass-upload.types";
import { getTableConfig } from "@/lib/mass-upload/tableConfigs";

interface TemplateDownloaderProps {
  tableName: MassUploadTableName;
  showFieldInfo?: boolean;
  /** dbField names of optional fields the user has marked required for this import. */
  requiredOverrides?: string[];
  /** Toggle an optional field's "required for this import" state. When provided, the
   *  optional-field rows render an interactive checkbox instead of a static marker. */
  onToggleRequired?: (dbField: string) => void;
}

export function TemplateDownloader({
  tableName,
  showFieldInfo = true,
  requiredOverrides = [],
  onToggleRequired,
}: TemplateDownloaderProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = getTableConfig(tableName);

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);

    try {
      const response = await fetch(`/api/mass-upload/template?table=${tableName}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to download template");
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tableName}_template.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      setError(err instanceof Error ? err.message : "Failed to download template");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!config) {
    return (
      <Alert severity="error">
        No configuration found for table: {tableName}
      </Alert>
    );
  }

  const requiredFields = config.fields.filter(f => f.required);
  const optionalFields = config.fields.filter(f => !f.required);
  const lookupFields = config.fields.filter(f => f.type === "uuid_lookup");

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 2 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" gutterBottom>
              {config.displayName} Template
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {config.description}
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={isDownloading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
            onClick={handleDownload}
            disabled={isDownloading || config.fields.length === 0}
            size="large"
          >
            {isDownloading ? "Downloading..." : "Download CSV Template"}
          </Button>

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Stack>
      </Paper>

      {showFieldInfo && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Template Fields
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            The downloaded template already includes <strong>every</strong> column below —
            fill in the ones you have and leave the rest blank. Nothing here needs to be
            selected to download.
            {onToggleRequired && (
              <>
                {" "}
                Want a field filled on every row? <strong>Tick it below</strong> to make it
                required for this import.
              </>
            )}
          </Typography>

          <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<CheckIcon fontSize="small" />}
              label={`${requiredFields.length} Required`}
              color="error"
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${optionalFields.length} Optional`}
              size="small"
              variant="outlined"
            />
            {requiredOverrides.length > 0 && (
              <Chip
                icon={<CheckIcon fontSize="small" />}
                label={`${requiredOverrides.length} required for this import`}
                color="warning"
                size="small"
              />
            )}
            {lookupFields.length > 0 && (
              <Chip
                icon={<LookupIcon fontSize="small" />}
                label={`${lookupFields.length} Lookup`}
                color="info"
                size="small"
                variant="outlined"
              />
            )}
          </Stack>

          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Required Fields
          </Typography>
          <List dense disablePadding>
            {requiredFields.map((field) => (
              <ListItem key={field.dbField} disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CheckIcon color="error" fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={field.csvHeader}
                  secondary={field.description}
                  primaryTypographyProps={{ fontWeight: "medium" }}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
            ))}
          </List>

          {optionalFields.length > 0 && (
            <>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
                Optional Fields{onToggleRequired ? " — tick to require for this import" : ""}
              </Typography>
              <List dense disablePadding>
                {optionalFields.map((field) => {
                  const isMarkedRequired = requiredOverrides.includes(field.dbField);
                  return (
                    <ListItem key={field.dbField} disableGutters>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        {onToggleRequired ? (
                          <Tooltip title="Require this field on every row in this import">
                            <Checkbox
                              edge="start"
                              size="small"
                              checked={isMarkedRequired}
                              onChange={() => onToggleRequired(field.dbField)}
                              inputProps={{ "aria-label": `Require ${field.csvHeader}` }}
                            />
                          </Tooltip>
                        ) : null}
                      </ListItemIcon>
                      <ListItemText
                        primaryTypographyProps={{ component: "div" }}
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <span>{field.csvHeader}</span>
                            {isMarkedRequired && (
                              <Chip
                                label="required"
                                size="small"
                                color="warning"
                                sx={{ height: 18, fontSize: "0.65rem" }}
                              />
                            )}
                            {field.type === "uuid_lookup" && (
                              <Chip
                                label="lookup"
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{ height: 18, fontSize: "0.65rem" }}
                              />
                            )}
                            {field.defaultValue !== undefined && (
                              <Chip
                                label={`default: ${field.defaultValue}`}
                                size="small"
                                variant="outlined"
                                sx={{ height: 18, fontSize: "0.65rem" }}
                              />
                            )}
                          </Stack>
                        }
                        secondary={field.description}
                        secondaryTypographyProps={{ variant: "caption" }}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </>
          )}

          {lookupFields.length > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="caption">
                <strong>Lookup fields</strong> accept names instead of IDs. For example,
                enter &quot;Rajesh Kumar&quot; instead of a UUID. The system will automatically
                match to existing records.
              </Typography>
            </Alert>
          )}
        </Paper>
      )}
    </Box>
  );
}

export default TemplateDownloader;
