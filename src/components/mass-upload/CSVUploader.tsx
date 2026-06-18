"use client";

import { useState, useCallback } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from "@mui/material";
import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  InsertDriveFile as FileIcon,
} from "@mui/icons-material";
import Papa from "papaparse";
import { MassUploadTableName, ParseResult } from "@/types/mass-upload.types";
import { parseCSVFile, parseCSVString, validateCSVHeaders } from "@/lib/mass-upload/csvParser";
import { getTableConfig } from "@/lib/mass-upload/tableConfigs";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const isXlsxFile = (f: File) =>
  f.name.toLowerCase().endsWith(".xlsx") || f.type === XLSX_MIME;
const isCsvFile = (f: File) =>
  f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv";

interface CSVUploaderProps {
  tableName: MassUploadTableName;
  onParseComplete: (result: ParseResult, file: File) => void;
  onError: (error: string) => void;
}

export function CSVUploader({
  tableName,
  onParseComplete,
  onError,
}: CSVUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [headerValidation, setHeaderValidation] = useState<{
    valid: boolean;
    missingRequired: string[];
    unknown: string[];
  } | null>(null);

  const config = getTableConfig(tableName);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const picked = files.find((f) => isCsvFile(f) || isXlsxFile(f));

      if (picked) {
        await processFile(picked);
      } else {
        onError("Please upload a CSV or Excel (.xlsx) file");
      }
    },
    [tableName]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await processFile(file);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [tableName]
  );

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setSelectedFile(file);
    setHeaderValidation(null);

    try {
      let parseResult: ParseResult;

      if (isXlsxFile(file)) {
        // Parse the .xlsx server-side (exceljs), then run the SAME client pipeline by
        // re-serialising the rows to CSV — reuses validation, sample detection, status.
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/mass-upload/parse", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Could not read the Excel file");
        }
        const rows: Record<string, string>[] = data.rows ?? [];
        const headers = config?.fields.map((f) => f.csvHeader) ?? [];
        const csv = Papa.unparse({
          fields: headers,
          data: rows.map((r) => headers.map((h) => r[h] ?? "")),
        });
        parseResult = parseCSVString(csv, tableName);
      } else {
        // Parse the CSV file
        parseResult = await parseCSVFile(file, tableName);
      }

      // Validate headers
      const headerCheck = validateCSVHeaders(parseResult.headers, tableName);
      setHeaderValidation(headerCheck);

      if (!headerCheck.valid) {
        onError(
          `Missing required columns: ${headerCheck.missingRequired.join(", ")}`
        );
        setIsProcessing(false);
        return;
      }

      // Pass result to parent
      onParseComplete(parseResult, file);
    } catch (err) {
      console.error("File processing error:", err);
      onError(err instanceof Error ? err.message : "Failed to process the file");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box>
      {/* Drop Zone */}
      <Paper
        sx={{
          p: 4,
          border: "2px dashed",
          borderColor: isDragging ? "primary.main" : "divider",
          backgroundColor: isDragging ? "action.hover" : "background.paper",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
          "&:hover": {
            borderColor: "primary.light",
            backgroundColor: "action.hover",
          },
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById("csv-file-input")?.click()}
      >
        <input
          id="csv-file-input"
          type="file"
          accept={`.csv,text/csv,.xlsx,${XLSX_MIME}`}
          hidden
          onChange={handleFileSelect}
        />

        {isProcessing ? (
          <Stack alignItems="center" spacing={2}>
            <CircularProgress />
            <Typography>Processing file...</Typography>
          </Stack>
        ) : (
          <Stack alignItems="center" spacing={2}>
            <UploadIcon sx={{ fontSize: 48, color: "text.secondary" }} />
            <Typography variant="h6">
              Drop your file here or click to browse
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Supported formats: Excel (.xlsx) and CSV (.csv)
            </Typography>
          </Stack>
        )}
      </Paper>

      {/* Selected File Info */}
      {selectedFile && !isProcessing && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <FileIcon color="primary" />
            <Box flex={1}>
              <Typography fontWeight="medium">{selectedFile.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </Typography>
            </Box>
            {headerValidation && (
              <Chip
                icon={headerValidation.valid ? <CheckIcon /> : <ErrorIcon />}
                label={headerValidation.valid ? "Valid headers" : "Invalid headers"}
                color={headerValidation.valid ? "success" : "error"}
                size="small"
              />
            )}
          </Stack>
        </Paper>
      )}

      {/* Header Validation Results */}
      {headerValidation && (
        <Box mt={2}>
          {headerValidation.missingRequired.length > 0 && (
            <Alert severity="error" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Missing required columns:
              </Typography>
              <List dense disablePadding>
                {headerValidation.missingRequired.map((header) => (
                  <ListItem key={header} disableGutters sx={{ py: 0 }}>
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <ErrorIcon color="error" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={header}
                      primaryTypographyProps={{ variant: "body2" }}
                    />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}

          {headerValidation.unknown.length > 0 && (
            <Alert severity="warning">
              <Typography variant="subtitle2" gutterBottom>
                Unknown columns (will be ignored):
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {headerValidation.unknown.map((header) => (
                  <Chip
                    key={header}
                    label={header}
                    size="small"
                    variant="outlined"
                    color="warning"
                  />
                ))}
              </Stack>
            </Alert>
          )}
        </Box>
      )}

      {/* Expected Columns Reference */}
      {config && (
        <Paper sx={{ p: 2, mt: 2, backgroundColor: "grey.50" }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Expected columns for {config.displayName}:
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {config.fields.map((field) => (
              <Chip
                key={field.dbField}
                label={field.csvHeader}
                size="small"
                variant={field.required ? "filled" : "outlined"}
                color={field.required ? "primary" : "default"}
                sx={{ mb: 0.5 }}
              />
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

export default CSVUploader;
