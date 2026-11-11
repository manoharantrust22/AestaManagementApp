/**
 * Gemini Intent Parser
 * Uses Google Gemini API for natural language understanding
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedIntent, ChatFilters, IntentFilters } from "./types";
import { QUERY_REGISTRY } from "./query-builder";
import dayjs from "dayjs";

// Get available intents from the query registry
const AVAILABLE_INTENTS = Object.keys(QUERY_REGISTRY);

// Track API failures to avoid repeated failed calls
let geminiDisabled = false;
let failureCount = 0;
const MAX_FAILURES = 3;

// System prompt for Gemini
const SYSTEM_PROMPT = `You are an intent parser for a construction management app. Parse the user's question and return a JSON object.

AVAILABLE INTENTS (use ONLY these exact values):
${AVAILABLE_INTENTS.map((i) => `- ${i}`).join("\n")}

DATE FILTERS:
- If user says "today", "yesterday", "this week", "last week", "this month", "last month", "this year", "last N days", extract the date range
- If user says "all time" or doesn't mention dates, set date_from and date_to to null
- Use YYYY-MM-DD format for dates

SITE FILTER:
- If user mentions a specific site name, try to extract it
- Otherwise, leave site_id as null (will use the app's current site filter)

ENTITY FILTERS:
- Extract laborer names if mentioned (e.g., "Raju's salary")
- Extract categories if mentioned (e.g., "mason count", "helper expenses")
- Extract limits if mentioned (e.g., "top 5 earners" -> limit: 5)

RESPONSE FORMAT (JSON only, no markdown):
{
  "intent": "one of the available intents",
  "confidence": 0.0 to 1.0,
  "filters": {
    "site_id": null or "site name if mentioned",
    "date_from": "YYYY-MM-DD" or null,
    "date_to": "YYYY-MM-DD" or null,
    "laborer_name": null or "name",
    "category": null or "category name",
    "limit": null or number
  }
}

EXAMPLES:
User: "what is the total material expense in srinivasan site?"
{"intent":"material_expenses","confidence":0.95,"filters":{"site_id":"srinivasan","date_from":null,"date_to":null,"laborer_name":null,"category":null,"limit":null}}

User: "how many workers came today?"
{"intent":"attendance_count","confidence":0.95,"filters":{"site_id":null,"date_from":"${dayjs().format("YYYY-MM-DD")}","date_to":"${dayjs().format("YYYY-MM-DD")}","laborer_name":null,"category":null,"limit":null}}

User: "top 5 earning workers this month"
{"intent":"laborer_earnings","confidence":0.9,"filters":{"site_id":null,"date_from":"${dayjs().startOf("month").format("YYYY-MM-DD")}","date_to":"${dayjs().format("YYYY-MM-DD")}","laborer_name":null,"category":null,"limit":5}}

User: "pending advances"
{"intent":"advance_pending","confidence":0.95,"filters":{"site_id":null,"date_from":null,"date_to":null,"laborer_name":null,"category":null,"limit":null}}

User: "labor expenses last 7 days"
{"intent":"labor_expenses","confidence":0.95,"filters":{"site_id":null,"date_from":"${dayjs().subtract(7, "day").format("YYYY-MM-DD")}","date_to":"${dayjs().format("YYYY-MM-DD")}","laborer_name":null,"category":null,"limit":null}}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- Use the exact intent names from the list above
- If you can't determine the intent, use "expense_total" with confidence 0.3`;

/**
 * Parse user input using Gemini API
 */
export async function parseWithGemini(
  input: string,
  defaultFilters: ChatFilters
): Promise<ParsedIntent | null> {
  // Server-only key. This parser used to read NEXT_PUBLIC_GEMINI_API_KEY, which
  // shipped the key to every browser. In the browser it now returns null and
  // the caller falls back to the keyword parser.
  const apiKey = getServerGeminiKey();

  if (!apiKey) {
    return null;
  }

  // Skip if Gemini has been disabled due to repeated failures
  if (geminiDisabled) {
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.1, // Low temperature for consistent parsing
        maxOutputTokens: 500,
      },
    });

    const prompt = `${SYSTEM_PROMPT}\n\nToday's date: ${dayjs().format("YYYY-MM-DD")}\n\nUser query: "${input}"`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse the JSON response
    const parsed = parseGeminiResponse(response);

    if (!parsed) {
      console.warn("Failed to parse Gemini response:", response);
      return null;
    }

    // Validate the intent
    if (!AVAILABLE_INTENTS.includes(parsed.intent)) {
      console.warn("Invalid intent from Gemini:", parsed.intent);
      return null;
    }

    // Merge with default filters
    const filters: IntentFilters = {
      site_id: parsed.filters.site_id ||
        (defaultFilters.siteId !== "all" ? defaultFilters.siteId : undefined),
      date_from: parsed.filters.date_from ||
        (defaultFilters.dateFrom ? dayjs(defaultFilters.dateFrom).format("YYYY-MM-DD") : undefined),
      date_to: parsed.filters.date_to ||
        (defaultFilters.dateTo ? dayjs(defaultFilters.dateTo).format("YYYY-MM-DD") : undefined),
      laborer_name: parsed.filters.laborer_name || undefined,
      category: parsed.filters.category || undefined,
      limit: parsed.filters.limit || undefined,
    };

    return {
      intent: parsed.intent,
      confidence: parsed.confidence || 0.8,
      filters,
      originalQuery: input,
    };
  } catch (error) {
    failureCount++;

    // Check if it's an API key, model, or rate limit error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("API key") ||
      errorMessage.includes("401") ||
      errorMessage.includes("400") ||
      errorMessage.includes("404") ||
      errorMessage.includes("429") ||
      errorMessage.includes("Too Many Requests") ||
      errorMessage.includes("RATE_LIMIT") ||
      errorMessage.includes("Not Found")
    ) {
      // Silently disable Gemini for this session - will use keyword fallback
      geminiDisabled = true;
    } else if (failureCount >= MAX_FAILURES) {
      geminiDisabled = true;
    }

    return null;
  }
}

/**
 * Parse the JSON response from Gemini
 */
function parseGeminiResponse(response: string): {
  intent: string;
  confidence: number;
  filters: {
    site_id: string | null;
    date_from: string | null;
    date_to: string | null;
    laborer_name: string | null;
    category: string | null;
    limit: number | null;
  };
} | null {
  try {
    // Try to extract JSON from the response
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```\n?/g, "");
    }

    // Find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

/**
 * Check if Gemini API is available
 */
export function isGeminiAvailable(): boolean {
  return !!getServerGeminiKey() && !geminiDisabled;
}

/** GEMINI_API_KEY is only readable on the server; never use a NEXT_PUBLIC_ key. */
function getServerGeminiKey(): string | undefined {
  if (typeof window !== "undefined") return undefined;
  return process.env.GEMINI_API_KEY || undefined;
}

/**
 * Reset Gemini state (useful when API key is updated)
 */
export function resetGeminiState(): void {
  geminiDisabled = false;
  failureCount = 0;
}
