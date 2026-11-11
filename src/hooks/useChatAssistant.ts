"use client";

import { useState, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import { parseIntentSmart } from "@/lib/chat-assistant/intent-parser";
import { executeQuery } from "@/lib/chat-assistant/query-builder";
import {
  formatResponse,
  formatUnknownIntentResponse,
  formatLowConfidenceResponse,
  formatErrorResponse,
  createUserMessage,
  createWelcomeMessage,
} from "@/lib/chat-assistant/response-formatter";
import { CONFIDENCE_THRESHOLDS } from "@/lib/chat-assistant/constants";
import type { ChatMessage, ChatFilters, ConversationHistoryItem } from "@/lib/chat-assistant/types";
import type { AssistantActionCard, AssistantRequest, AssistantResponse, ConfirmResponse } from "@/lib/assistant/types";
import { blobToBase64 } from "@/hooks/useVoiceCapture";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/cache/keys";
import { useSitesData } from "@/contexts/SiteContext";

interface UseChatAssistantOptions {
  initialSiteId?: string;
}

export function useChatAssistant(options: UseChatAssistantOptions = {}) {
  const { initialSiteId } = options;
  const { sites } = useSitesData();
  const queryClient = useQueryClient();

  // Chat messages state
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage()]);

  // Chat filters state - Default to "All Time" (no date filters)
  const [filters, setFilters] = useState<ChatFilters>({
    siteId: initialSiteId || "all",
    dateFrom: null,
    dateTo: null,
  });

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Conversation history for multi-turn Groq context
  const [conversationHistory, setConversationHistory] = useState<ConversationHistoryItem[]>([]);

  // Update site filter when initialSiteId changes
  useEffect(() => {
    if (initialSiteId) {
      setFilters((prev) => ({ ...prev, siteId: initialSiteId }));
    }
  }, [initialSiteId]);

  // Get site name for context
  const getSiteName = useCallback(
    (siteId: string | "all"): string => {
      if (siteId === "all") return "All Sites";
      return sites.find((s) => s.id === siteId)?.name ?? "Unknown Site";
    },
    [sites]
  );

  const buildContext = useCallback(() => {
    const dateFrom = filters.dateFrom
      ? dayjs(filters.dateFrom).format("YYYY-MM-DD")
      : dayjs().subtract(30, "day").format("YYYY-MM-DD");
    const dateTo = filters.dateTo ? dayjs(filters.dateTo).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
    return {
      siteId: filters.siteId === "all" ? null : filters.siteId,
      siteName: getSiteName(filters.siteId),
      dateFrom,
      dateTo,
    };
  }, [filters, getSiteName]);

  /** POST to the Gemini agent. Throws on network/API failure. */
  const callAssistant = useCallback(
    async (payload: Partial<AssistantRequest>): Promise<AssistantResponse> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...buildContext(), history: conversationHistory, ...payload }),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as AssistantResponse;
        if (!res.ok || json.error) throw new Error(json.error || `API error: ${res.status}`);
        return json;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [buildContext, conversationHistory]
  );

  const pushAssistantReply = useCallback((userText: string, res: AssistantResponse) => {
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      type: "assistant",
      text: res.answer,
      actions: res.actions?.length ? res.actions : undefined,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);
    const actionNote = res.actions?.length
      ? `\n[Prepared for confirmation: ${res.actions.map((a) => a.summary).join(" | ")}]`
      : "";
    setConversationHistory((prev) => [
      ...prev.slice(-18),
      { role: "user", content: userText },
      { role: "assistant", content: res.answer + actionNote },
    ]);
  }, []);

  // Send a typed message and get a response
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage = createUserMessage(trimmed);
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const res = await callAssistant({ message: trimmed });
        pushAssistantReply(trimmed, res);
      } catch (apiErr) {
        // --- Fallback path: keyword-based intent parser (when API is unavailable) ---
        console.warn("Assistant API unavailable, falling back to keyword parser:", apiErr);
        try {
          const parsedIntent = await parseIntentSmart(trimmed, filters);

          if (parsedIntent.confidence < CONFIDENCE_THRESHOLDS.UNKNOWN) {
            setMessages((prev) => [...prev, formatUnknownIntentResponse()]);
            return;
          }

          if (parsedIntent.confidence < CONFIDENCE_THRESHOLDS.HIGH) {
            setMessages((prev) => [
              ...prev,
              formatLowConfidenceResponse(parsedIntent, [parsedIntent.intent]),
            ]);
            return;
          }

          const result = await executeQuery(parsedIntent.intent, parsedIntent.filters);
          const siteName = getSiteName(filters.siteId);
          const responseMsg = formatResponse(result, parsedIntent, siteName);
          setMessages((prev) => [...prev, responseMsg]);
        } catch (fallbackErr) {
          console.error("Chat assistant fallback error:", fallbackErr);
          setMessages((prev) => [...prev, formatErrorResponse(fallbackErr as Error)]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [filters, isLoading, getSiteName, callAssistant, pushAssistantReply]
  );

  // Send a voice message (Tamil / English). The server transcribes it.
  const sendVoice = useCallback(
    async (blob: Blob, mime: string) => {
      if (isLoading) return;
      const placeholderId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: placeholderId, type: "user", text: "🎤 …", isVoice: true, timestamp: new Date() },
      ]);
      setIsLoading(true);
      try {
        const data = await blobToBase64(blob);
        const res = await callAssistant({ audio: { data, mimeType: mime } });
        const heard = res.transcript?.text ?? "";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  text: heard ? `🎤 ${heard}` : "🎤 (not clear)",
                  translation:
                    res.transcript && res.transcript.language !== "en" && res.transcript.text_en !== heard
                      ? res.transcript.text_en
                      : undefined,
                }
              : m
          )
        );
        pushAssistantReply(heard || "(voice message)", res);
      } catch (err) {
        setMessages((prev) => [
          ...prev.map((m) => (m.id === placeholderId ? { ...m, text: "🎤 (failed to send)" } : m)),
          formatErrorResponse(err as Error),
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, callAssistant, pushAssistantReply]
  );

  // Confirm / cancel a prepared action card.
  const decideAction = useCallback(
    async (messageId: string, actionId: string, decision: "confirm" | "cancel") => {
      const patch = (fields: Partial<AssistantActionCard>) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId && m.actions
              ? { ...m, actions: m.actions.map((a) => (a.id === actionId ? { ...a, ...fields } : a)) }
              : m
          )
        );
      patch({ status: "executing" });
      try {
        const res = await fetch("/api/assistant/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionId, decision }),
        });
        const json = (await res.json().catch(() => ({}))) as ConfirmResponse;
        if (json.status === "executed" || json.status === "cancelled") {
          patch({ status: json.status, resultMessage: json.message, url: json.url });
          setConversationHistory((prev) => [
            ...prev.slice(-19),
            {
              role: "assistant",
              content:
                json.status === "executed"
                  ? `[User confirmed; done: ${json.message ?? "ok"}]`
                  : "[User cancelled that action]",
            },
          ]);
          if (json.status === "executed") queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        } else {
          patch({ status: "failed", error: json.error || "Failed" });
        }
      } catch (err) {
        patch({ status: "failed", error: err instanceof Error ? err.message : "Failed" });
      }
    },
    [queryClient]
  );

  // Handle suggestion clicks (from message suggestions or quick actions)
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      // Check if it's "No, show suggestions" - show unknown response
      if (suggestion.toLowerCase().includes("show suggestions")) {
        setMessages((prev) => [...prev, formatUnknownIntentResponse()]);
        return;
      }

      // Otherwise, send as a new query
      sendMessage(suggestion);
    },
    [sendMessage]
  );

  // Clear chat history (keep welcome message)
  const clearChat = useCallback(() => {
    setMessages([createWelcomeMessage()]);
    setConversationHistory([]);
  }, []);

  return {
    messages,
    filters,
    setFilters,
    isLoading,
    sendMessage,
    sendVoice,
    decideAction,
    handleSuggestionClick,
    clearChat,
  };
}
