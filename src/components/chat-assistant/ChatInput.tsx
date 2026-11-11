"use client";

import { useState, KeyboardEvent } from "react";
import { Box, TextField, IconButton, InputAdornment, Stack, Typography, Button } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import CloseIcon from "@mui/icons-material/Close";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";

interface ChatInputProps {
  onSend: (message: string) => void;
  onSendVoice?: (blob: Blob, mime: string) => void;
  isLoading: boolean;
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60)
    .toString()
    .padStart(2, "0")}`;
}

export default function ChatInput({ onSend, onSendVoice, isLoading }: ChatInputProps) {
  const [input, setInput] = useState("");
  const voice = useVoiceCapture((a) => onSendVoice?.(a.blob, a.mime));

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed && !isLoading) {
      onSend(trimmed);
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Enter to send (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      sx={{
        p: 2,
        pb: "calc(16px + env(safe-area-inset-bottom))",
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {voice.recording ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton aria-label="Cancel recording" onClick={voice.cancel}>
            <CloseIcon />
          </IconButton>
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: "error.main",
                animation: "recDot 1s ease-in-out infinite",
                "@keyframes recDot": { "50%": { opacity: 0.3 } },
              }}
            />
            <Typography variant="body2">Listening… {fmt(voice.elapsed)} — speak in Tamil or English</Typography>
          </Box>
          <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={voice.stop}>
            Send
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask, or tell me what to do…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            size="small"
            slotProps={{
              input: {
                endAdornment: input.trim() ? (
                  <InputAdornment position="end">
                    <IconButton onClick={handleSend} disabled={isLoading} color="primary" size="small" edge="end" aria-label="Send">
                      <SendIcon />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
                sx: { borderRadius: 2 },
              },
            }}
          />
          {onSendVoice && (
            <IconButton
              aria-label="Talk"
              onClick={voice.start}
              disabled={isLoading}
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                width: 44,
                height: 44,
                flexShrink: 0,
                "&:hover": { bgcolor: "primary.dark" },
                "&.Mui-disabled": { bgcolor: "action.disabledBackground" },
              }}
            >
              <MicIcon />
            </IconButton>
          )}
        </Stack>
      )}
      {voice.error && (
        <Typography variant="caption" color="error" component="div" sx={{ mt: 0.5 }}>
          {voice.error}
        </Typography>
      )}
    </Box>
  );
}
