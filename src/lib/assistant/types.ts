export interface AssistantHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantRequest {
  /** Typed message. Either this or `audio`. */
  message?: string;
  /** Base64 audio recorded in the browser. */
  audio?: { data: string; mimeType: string };
  siteId: string | null;
  siteName: string;
  dateFrom: string;
  dateTo: string;
  history: AssistantHistoryItem[];
}

export type AssistantActionStatus = "proposed" | "executing" | "executed" | "cancelled" | "failed";

export interface AssistantActionCard {
  id: string;
  tool: string;
  summary: string;
  status: AssistantActionStatus;
  resultMessage?: string;
  url?: string;
  error?: string;
}

export interface AssistantResponse {
  answer: string;
  /** What we heard, for voice input. */
  transcript?: { text: string; language: string; text_en: string };
  actions: AssistantActionCard[];
  error?: string;
}

export interface ConfirmRequest {
  actionId: string;
  decision: "confirm" | "cancel";
}

export interface ConfirmResponse {
  status: AssistantActionStatus;
  message?: string;
  url?: string;
  error?: string;
}
