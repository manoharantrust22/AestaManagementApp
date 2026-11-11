"use client";

import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import ChatMessage from "./ChatMessage";
import type { ChatMessage as ChatMessageType } from "@/lib/chat-assistant/types";

interface ChatMessageListProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSuggestionClick?: (suggestion: string) => void;
  onDecideAction?: (messageId: string, actionId: string, decision: "confirm" | "cancel") => void;
  onNavigate?: () => void;
}

export default function ChatMessageList({
  messages,
  isLoading,
  onSuggestionClick,
  onDecideAction,
  onNavigate,
}: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <Box
      sx={{
        flex: 1,
        overflowY: "auto",
        py: 2,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onSuggestionClick={onSuggestionClick}
          onDecideAction={onDecideAction}
          onNavigate={onNavigate}
        />
      ))}

      {/* Loading indicator */}
      {isLoading && (
        <ChatMessage
          message={{
            id: "loading",
            type: "assistant",
            text: "",
            isLoading: true,
            timestamp: new Date(),
          }}
        />
      )}

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </Box>
  );
}
