/**
 * Textarea + parse button for the AI's JSON response. Surfaces Zod errors
 * (path + message) when validation fails.
 */

"use client";

import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";

interface PasteAndParseProps {
  pasteText: string;
  parseError: string | null;
  isParsing: boolean;
  onChange: (text: string) => void;
  onParse: () => void;
}

export default function PasteAndParse({
  pasteText,
  parseError,
  isParsing,
  onChange,
  onParse,
}: PasteAndParseProps) {
  const empty = pasteText.trim().length === 0;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Paste the AI&apos;s response below. The fenced{" "}
        <Box component="code" sx={{ fontFamily: "monospace" }}>
          ```json … ```
        </Box>{" "}
        block is fine — we&apos;ll strip it. Plain JSON also works.
      </Typography>

      <TextField
        multiline
        minRows={10}
        maxRows={20}
        fullWidth
        value={pasteText}
        onChange={(e) => onChange(e.target.value)}
        placeholder='```json&#10;{&#10;  "kind": "purchase",&#10;  ...&#10;}&#10;```'
        InputProps={{
          sx: {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
          },
        }}
      />

      {parseError ? (
        <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>
          {parseError}
        </Alert>
      ) : null}

      <Box>
        <Button
          variant="contained"
          size="large"
          onClick={onParse}
          disabled={empty || isParsing}
        >
          {isParsing ? "Parsing…" : "Parse & preview"}
        </Button>
      </Box>
    </Stack>
  );
}
