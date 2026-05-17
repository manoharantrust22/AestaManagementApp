# AESTA Assistant — Groq-Powered Natural Language Query Engine

**Date:** 2026-05-17  
**Status:** Approved for implementation

---

## Context

The AESTA Assistant chat panel exists in the UI (`src/components/chat-assistant/`) but does not work correctly. The root cause is the current intent-parsing approach: it tries to extract a rigid intent keyword ("total_salary", "attendance_count") from user text, then maps that to a single fixed Supabase query. This approach fails for any phrasing that doesn't match the hardcoded keywords — and breaks entirely when the Gemini API key is missing or rate-limited.

The goal is to replace the intent-matching approach with a proper LLM tool-calling loop, using Groq (Llama 3.3 70B) as a free, fast, capable backbone. The assistant should answer any natural language question about data in the app — attendance, salary, expenses, materials, rentals, contracts, tea shop, inventory, and cross-site comparisons.

---

## Architecture

### Request Flow

```
Browser (useChatAssistant.ts hook)
  │
  │  POST /api/chat
  │  { question, siteId, companyId, dateFrom, dateTo, history[] }
  ▼
Next.js API Route  /api/chat/route.ts
  │
  │  1. Validate request, get authenticated Supabase server client
  │  2. Call Groq with system prompt + tool definitions + conversation history
  │  3. Groq returns tool_calls (which queries to run + parameters)
  │  4. Execute Supabase queries for each tool call
  │  5. Send results back to Groq
  │  6. Groq returns final natural language answer
  │
  ▼
Browser receives { answer: string, error?: string }
  │
  ▼
ChatMessage.tsx renders the answer
```

### Key Design Decisions

- **Server-side LLM calls only.** `GROQ_API_KEY` is a server-only env var (no `NEXT_PUBLIC_` prefix). Never exposed to the browser.
- **Server-side Supabase queries.** The API route uses `createServerClient()` (from `src/lib/supabase/server.ts`) which authenticates via the user's cookie session. RLS still applies — the user only sees data they are authorized for.
- **Multi-turn conversation.** The hook maintains a `history` array of `{role, content}` pairs. Each request sends the full history to Groq so follow-up questions like "what about last month?" work naturally.
- **No streaming in v1.** Response arrives as a single JSON payload for simplicity. Streaming can be added later.
- **Keyword fallback on API failure.** If the Groq API call fails (network error, rate limit), the hook falls back to the existing keyword-based intent parser. Degraded but functional.

---

## Data Coverage — 34 Tools

Each tool is a Supabase query function exposed to Groq as a callable function. Groq picks whichever tools are relevant to answer the user's question, and can call multiple tools in a single response. Total: 3+5+3+3+4+3+4+2+4+2+1 = 34 tools.

### Attendance (3 tools)
| Tool | Description |
|------|-------------|
| `get_attendance_count` | Total worker count for a date range on a site |
| `get_attendance_list` | Named list of who came, with day/half-day breakdown |
| `get_laborer_attendance` | Attendance record for a specific named laborer |

### Salary & Pay (5 tools)
| Tool | Description |
|------|-------------|
| `get_total_salary` | Total salary bill for the period |
| `get_salary_paid` | Amount already settled/paid |
| `get_salary_pending` | Remaining unpaid amount |
| `get_top_earners` | Top N workers by total earnings |
| `get_laborer_earnings` | One specific laborer's earnings |

### Expenses (3 tools)
| Tool | Description |
|------|-------------|
| `get_total_expenses` | All expenses for the period |
| `get_expenses_by_category` | Breakdown by material / labour / machinery |
| `get_daily_cost` | Day-by-day cost for a date range |

### Advances (3 tools)
| Tool | Description |
|------|-------------|
| `get_total_advances` | Total advance amount given in period |
| `get_pending_advances` | Outstanding advances not yet recovered |
| `get_laborer_advance` | Advance balance for a specific laborer |

### Materials & Inventory (4 tools)
| Tool | Description |
|------|-------------|
| `get_material_stock` | Current stock levels on site |
| `get_pending_purchase_orders` | POs not yet fully delivered |
| `get_recent_deliveries` | Materials received in a date range |
| `get_material_usage` | How much of a material was consumed from inventory |

### Rentals & Equipment (3 tools)
| Tool | Description |
|------|-------------|
| `get_active_rentals` | Currently active rental orders |
| `get_rental_cost` | Total rental expense for the period |
| `get_equipment_status` | Equipment deployed on site + condition |

### Contracts & Settlements (4 tools)
| Tool | Description |
|------|-------------|
| `get_contract_summary` | Contract value, scope, % complete |
| `get_client_payments` | Payments received from client |
| `get_settlement_status` | Mesthri group settlement pending/paid status |
| `get_settlement_history` | Settled amounts in a date range |

### Tea Shop (2 tools)
| Tool | Description |
|------|-------------|
| `get_tea_shop_balance` | Current credit/debit balance |
| `get_tea_shop_entries` | Tea shop entry records for a period |

### Laborers & Teams (4 tools)
| Tool | Description |
|------|-------------|
| `get_laborer_count` | Total active laborer count |
| `get_laborers_by_category` | Mason / helper / carpenter breakdown |
| `get_team_list` | All teams on site with leader |
| `get_team_members` | Members of a specific named team |

### Cross-Site (2 tools)
| Tool | Description |
|------|-------------|
| `get_cross_site_expenses` | Expense comparison across all company sites |
| `get_cross_site_attendance` | Attendance comparison across all company sites |

### Misc (1 tool)
| Tool | Description |
|------|-------------|
| `get_holiday_list` | Site holidays in a date range |

---

## System Prompt

```
You are AESTA Assistant, an AI helper for Aesta Construction Manager.
You help site engineers and managers get quick insights from their site data.

Current context:
- Site: {site_name} (ID: {site_id})
- Company ID: {company_id}
- Date range: {date_from} to {date_to}
- Today: {today}

Instructions:
1. Always use tools to fetch data before answering quantitative questions.
2. Format all monetary amounts with ₹ symbol (Indian number format: ₹1,25,000).
3. Lead with the key number or fact, then add details if relevant.
4. You may call multiple tools if the question spans multiple domains.
5. If the user asks about a date not in the selected range, derive the correct date range from their question.
6. Respond in Tamil if the user writes in Tamil; otherwise respond in English.
7. If no relevant data is found, say so clearly — do not guess or fabricate numbers.
8. Keep answers concise — construction managers are busy.
```

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `src/app/api/chat/route.ts` | POST handler: auth → Groq tool-calling loop → response |
| `src/lib/chat-assistant/chat-tools.ts` | 34 tool definitions (OpenAI format) + execution functions |

### Modified Files
| File | Change |
|------|--------|
| `src/hooks/useChatAssistant.ts` | Call `POST /api/chat` instead of Gemini; maintain history array; keyword fallback on failure |
| `src/lib/chat-assistant/query-builder.ts` | Add material usage, stock, cross-site query functions |
| `.env.local` | Add `GROQ_API_KEY=gsk_...` (server-only, no NEXT_PUBLIC_ prefix) |

### Installed Package
```
groq-sdk  (npm install groq-sdk)
```

### Unchanged (kept for keyword fallback)
- `src/lib/chat-assistant/gemini-parser.ts`
- `src/lib/chat-assistant/intent-parser.ts`
- `src/lib/chat-assistant/response-formatter.ts`
- All UI components in `src/components/chat-assistant/`

---

## API Contract

**Request:**
```typescript
POST /api/chat
{
  question: string;
  siteId: string | null;       // null = All Sites mode
  companyId: string;
  siteName: string;
  dateFrom: string;            // YYYY-MM-DD
  dateTo: string;              // YYYY-MM-DD
  history: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}
```

**Response:**
```typescript
{
  answer: string;    // Natural language response from Groq
  error?: string;    // Set only on failure
}
```

---

## Groq Tool-Calling Loop (Pseudocode)

```typescript
// In /api/chat/route.ts
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

let messages = [systemMessage, ...history, { role: "user", content: question }];

while (true) {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    tools: TOOL_DEFINITIONS,   // 32 tool schemas
    tool_choice: "auto",
    temperature: 0.2,
  });

  const choice = response.choices[0];

  if (choice.finish_reason === "tool_calls") {
    // Execute each tool call against Supabase
    const toolResults = await Promise.all(
      choice.message.tool_calls.map(tc => executeTool(tc, supabase, context))
    );
    // Feed results back to Groq
    messages = [...messages, choice.message, ...toolResults];
    continue;
  }

  // finish_reason === "stop" → final answer
  return { answer: choice.message.content };
}
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `GROQ_API_KEY` missing | API route returns 500 with helpful message; hook falls back to keyword parser |
| Groq rate limit (429) | Same fallback |
| Supabase query returns empty | Groq receives empty result, says "no data found for that period" |
| Tool call with invalid parameters | Supabase query returns error; fed back to Groq which adjusts |
| Network timeout (>15s) | API route returns timeout error; hook shows error message |

---

## Verification Plan

1. **Unit**: Check that each of the 32 tool execution functions returns correctly-typed `QueryResult`
2. **Integration (API route)**: POST to `/api/chat` with a test question via the Next.js dev server; confirm Groq calls tools and returns a valid answer
3. **End-to-end (Playwright)**:
   - Navigate to `http://localhost:3000/dev-login`
   - Open AI Assistant panel
   - Ask: "How many workers came today?" → confirm named list appears
   - Ask: "Total salary this week?" → confirm ₹ amount
   - Ask: "Which site spent the most this month?" → confirm cross-site table
   - Ask: "cement stock levels" → confirm material data
   - Test Tamil: "இந்த வாரம் மொத்த சம்பளம் என்ன?" → confirm Tamil response
4. **Fallback**: Temporarily remove `GROQ_API_KEY` from `.env.local` and confirm keyword parser still handles basic queries