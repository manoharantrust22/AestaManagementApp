"use client";

import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  keyframes,
} from "@mui/material";
import type { ChatMessage as ChatMessageType } from "@/lib/chat-assistant/types";
import ConfirmActionCard from "./ConfirmActionCard";

interface ChatMessageProps {
  message: ChatMessageType;
  onSuggestionClick?: (suggestion: string) => void;
  onDecideAction?: (messageId: string, actionId: string, decision: "confirm" | "cancel") => void;
  onNavigate?: () => void;
}

// Typing indicator animation
const bounce = keyframes`
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
`;

export default function ChatMessage({
  message,
  onSuggestionClick,
  onDecideAction,
  onNavigate,
}: ChatMessageProps) {
  const isUser = message.type === "user";

  // Loading state (typing indicator)
  if (message.isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-start",
          mb: 1.5,
          px: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            bgcolor: "grey.100",
            borderRadius: 2,
            display: "flex",
            gap: 0.5,
            alignItems: "center",
          }}
        >
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: "grey.400",
                animation: `${bounce} 1.2s ease-in-out infinite`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 1.5,
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          maxWidth: "85%",
          bgcolor: isUser ? "primary.main" : "grey.100",
          color: isUser ? "white" : "text.primary",
          borderRadius: 2,
          borderTopRightRadius: isUser ? 0 : 2,
          borderTopLeftRadius: isUser ? 2 : 0,
        }}
      >
        {/* Message Text */}
        <Typography
          variant="body2"
          sx={{
            whiteSpace: "pre-line",
            lineHeight: 1.5,
          }}
        >
          {message.text}
        </Typography>
        {message.translation && (
          <Typography variant="caption" component="div" sx={{ mt: 0.5, opacity: 0.85, whiteSpace: "pre-line" }}>
            EN: {message.translation}
          </Typography>
        )}

        {/* Confirm cards for actions the assistant prepared */}
        {message.actions?.map((a) => (
          <ConfirmActionCard
            key={a.id}
            action={a}
            onDecide={(decision) => onDecideAction?.(message.id, a.id, decision)}
            onNavigate={onNavigate}
          />
        ))}

        {/* Highlight Value (big number display) */}
        {message.highlightValue && (
          <Typography
            variant="h4"
            fontWeight={700}
            sx={{
              mt: 1,
              color: isUser ? "white" : "primary.main",
            }}
          >
            {message.highlightValue}
          </Typography>
        )}

        {/* Table Data */}
        {message.tableData && (
          <Box
            sx={{
              mt: 1.5,
              mx: -1,
              overflowX: "auto",
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  {message.tableData.headers.map((header, i) => (
                    <TableCell
                      key={i}
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        py: 0.75,
                        borderBottom: 1,
                        borderColor: isUser
                          ? "rgba(255,255,255,0.3)"
                          : "divider",
                        color: isUser ? "white" : "text.primary",
                      }}
                    >
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {message.tableData.rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell
                        key={cellIndex}
                        sx={{
                          fontSize: "0.75rem",
                          py: 0.5,
                          borderBottom:
                            rowIndex === message.tableData!.rows.length - 1
                              ? 0
                              : 1,
                          borderColor: isUser
                            ? "rgba(255,255,255,0.2)"
                            : "divider",
                          color: isUser ? "white" : "text.primary",
                        }}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {/* Suggested Actions */}
        {message.suggestedActions && message.suggestedActions.length > 0 && (
          <Box
            sx={{
              mt: 1.5,
              display: "flex",
              flexWrap: "wrap",
              gap: 0.75,
            }}
          >
            {message.suggestedActions.map((action, i) => (
              <Chip
                key={i}
                label={action}
                size="small"
                variant="outlined"
                onClick={() => onSuggestionClick?.(action)}
                sx={{
                  cursor: "pointer",
                  borderColor: isUser ? "rgba(255,255,255,0.5)" : "primary.main",
                  color: isUser ? "white" : "primary.main",
                  "&:hover": {
                    bgcolor: isUser
                      ? "rgba(255,255,255,0.1)"
                      : "primary.50",
                  },
                }}
              />
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
