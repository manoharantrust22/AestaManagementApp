/**
 * Chat Assistant Types
 * TypeScript interfaces for the AESTA Chat Assistant feature
 */

// ============================================================================
// Chat Message Types
// ============================================================================

export interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  text: string;
  tableData?: {
    headers: string[];
    rows: string[][];
  };
  highlightValue?: string;
  suggestedActions?: string[];
  timestamp: Date;
  isLoading?: boolean;
}

// ============================================================================
// Chat Filters
// ============================================================================

export interface ChatFilters {
  siteId: string | "all";
  dateFrom: Date | null;
  dateTo: Date | null;
}

// ============================================================================
// Intent Parser Types
// ============================================================================

export interface ParsedIntent {
  intent: string;
  confidence: number; // 0-1 scale
  filters: IntentFilters;
  originalQuery: string;
}

export interface IntentFilters {
  site_id?: string;
  date_from?: string; // YYYY-MM-DD format
  date_to?: string; // YYYY-MM-DD format
  laborer_name?: string;
  team_name?: string;
  category?: string;
  status?: string;
  limit?: number;
}

// ============================================================================
// Query Result Types
// ============================================================================

export type QueryResultType = "value" | "table" | "list" | "empty";

export interface QueryResult {
  type: QueryResultType;
  value?: number;
  label?: string;
  tableData?: {
    headers: string[];
    rows: string[][];
  };
  listItems?: string[];
  siteName?: string;
  dateRange?: {
    from: string;
    to: string;
  };
}

export type QueryFunction = (filters: IntentFilters) => Promise<QueryResult>;

// ============================================================================
// Date Extraction Types
// ============================================================================

export interface DateRange {
  from: string | null; // YYYY-MM-DD format
  to: string | null; // YYYY-MM-DD format
}

// ============================================================================
// Entity Extraction Types
// ============================================================================

export interface ExtractedEntities {
  laborer_name?: string;
  team_name?: string;
  category?: string;
  limit?: number;
}

// ============================================================================
// Quick Action Types
// ============================================================================

export interface QuickAction {
  label: string;
  query: string;
}

// ============================================================================
// Intent Keyword Mapping Types
// ============================================================================

export type IntentKeywords = Record<string, string[]>;

// ============================================================================
// Chat State Types
// ============================================================================

export interface ChatState {
  messages: ChatMessage[];
  filters: ChatFilters;
  isLoading: boolean;
}

// ============================================================================
// Chat API Types (Groq integration)
// ============================================================================

export interface ConversationHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface ChatApiRequest {
  question: string;
  siteId: string | null;        // null = All Sites (company-wide)
  companyId: string;
  siteName: string;
  dateFrom: string;             // YYYY-MM-DD
  dateTo: string;               // YYYY-MM-DD
  history: ConversationHistoryItem[];
}

export interface ChatApiResponse {
  answer: string;
  error?: string;
}
