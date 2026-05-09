/**
 * Renders the AI prompt the user copies into ChatGPT or Gemini. Includes
 * copy-to-clipboard, visual feedback, and a quick-link to open ChatGPT.
 */

"use client";

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Link,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ContentCopy as CopyIcon,
  CheckCircle as CheckCircleIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";

interface PromptCopyPanelProps {
  prompt: string;
  modeLabel: string;
}

export default function PromptCopyPanel({ prompt, modeLabel }: PromptCopyPanelProps) {
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setErr(null);
      window.setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        1. Copy the prompt below. 2. Open{" "}
        <Link
          href="https://chat.openai.com/"
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
        >
          ChatGPT <OpenInNewIcon sx={{ fontSize: 12, verticalAlign: "middle" }} />
        </Link>
        {" "}or{" "}
        <Link
          href="https://gemini.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
        >
          Gemini <OpenInNewIcon sx={{ fontSize: 12, verticalAlign: "middle" }} />
        </Link>
        . 3. Paste this prompt and attach your {modeLabel.toLowerCase()} image. 4. Copy the JSON it returns and paste it into the next step.
      </Typography>

      {err ? <Alert severity="error">{err}</Alert> : null}

      <Paper
        variant="outlined"
        sx={{
          position: "relative",
          bgcolor: "grey.50",
          p: 2,
          maxHeight: 360,
          overflow: "auto",
        }}
      >
        <Tooltip title={copied ? "Copied" : "Copy prompt"}>
          <IconButton
            size="small"
            onClick={onCopy}
            sx={{ position: "absolute", top: 8, right: 8 }}
            color={copied ? "success" : "default"}
          >
            {copied ? <CheckCircleIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Box
          component="pre"
          sx={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            paddingRight: 5,
          }}
        >
          {prompt}
        </Box>
      </Paper>

      <Button
        variant="contained"
        startIcon={copied ? <CheckCircleIcon /> : <CopyIcon />}
        color={copied ? "success" : "primary"}
        onClick={onCopy}
        size="large"
      >
        {copied ? "Copied — paste it into ChatGPT/Gemini" : "Copy prompt"}
      </Button>
    </Stack>
  );
}
