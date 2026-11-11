"use client";

import {
  Drawer,
  Box,
  Typography,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useChatAssistant } from "@/hooks/useChatAssistant";
import ChatMessageList from "./ChatMessageList";
import ChatInput from "./ChatInput";
import ChatFilters from "./ChatFilters";
import QuickActionChips from "./QuickActionChips";

interface ChatAssistantProps {
  open: boolean;
  onClose: () => void;
}

export default function ChatAssistant({ open, onClose }: ChatAssistantProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { selectedSite } = useSelectedSite();

  const {
    messages,
    filters,
    setFilters,
    isLoading,
    sendMessage,
    sendVoice,
    decideAction,
    handleSuggestionClick,
    clearChat,
  } = useChatAssistant({
    initialSiteId: selectedSite?.id,
  });

  return (
    <>
      {/* Chat Drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: isMobile ? "100%" : 400,
            display: "flex",
            flexDirection: "column",
            height: "100%",
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "primary.main",
            color: "white",
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <SmartToyIcon />
              <Typography variant="h6" fontWeight={700}>
                AESTA Assistant
              </Typography>
            </Box>
            <Box>
              <IconButton
                onClick={clearChat}
                size="small"
                sx={{ color: "white", mr: 0.5 }}
                title="Clear chat"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
              <IconButton
                onClick={onClose}
                size="small"
                sx={{ color: "white" }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </Box>

        {/* Filters */}
        <ChatFilters filters={filters} onChange={setFilters} />

        {/* Messages */}
        <ChatMessageList
          messages={messages}
          isLoading={isLoading}
          onSuggestionClick={handleSuggestionClick}
          onDecideAction={decideAction}
          onNavigate={onClose}
        />

        {/* Quick Actions */}
        <QuickActionChips onSelect={sendMessage} />

        {/* Input */}
        <ChatInput onSend={sendMessage} onSendVoice={sendVoice} isLoading={isLoading} />
      </Drawer>
    </>
  );
}
