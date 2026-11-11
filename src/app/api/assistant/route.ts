import { NextRequest, NextResponse } from "next/server";
import type { Content, Part } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { GEMINI_MODEL, getGemini, isGeminiConfigured } from "@/lib/ai/gemini";
import { transcribeAudioBase64 } from "@/lib/ai/transcribe";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/chat-assistant/chat-tools";
import { toGeminiDeclarations } from "@/lib/assistant/toolAdapter";
import {
  LOOKUP_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  proposeAction,
  runLookup,
  todayIST,
  toolsForRole,
  type AssistantUser,
  type UserRole,
} from "@/lib/assistant/actionTools";
import type { AssistantActionCard, AssistantRequest, AssistantResponse } from "@/lib/assistant/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TURNS = 6;
const MAX_HISTORY = 20;
const MAX_AUDIO_B64 = 14 * 1024 * 1024; // ~10MB raw

const READ_DECLARATIONS = toGeminiDeclarations(TOOL_DEFINITIONS as any);

function systemPrompt(ctx: {
  me: AssistantUser;
  companyId: string;
  siteId: string | null;
  siteName: string;
  dateFrom: string;
  dateTo: string;
}) {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" });
  return `You are AESTA Assistant inside Aesta Construction Manager, a construction company app in Tamil Nadu.
You are not just a Q&A bot: you GET THINGS DONE in the app for the person talking to you — assign tasks, update task status, add updates, report app problems — and you answer questions about site data.

Who is talking: ${ctx.me.name} (role: ${ctx.me.role}, user_id: ${ctx.me.id}).
Today: ${todayIST()} (${weekday}), timezone Asia/Kolkata.
Selected site: ${ctx.siteName}${ctx.siteId ? ` (site_id: ${ctx.siteId})` : " (all sites)"}. Company id: ${ctx.companyId}.
Date range selected in the app: ${ctx.dateFrom} to ${ctx.dateTo}.

LANGUAGE
- Reply in the user's language. If they speak/write Tamil, reply in Tamil script, simple spoken style. If English, reply in English. Tanglish → reply in the same mix.
- Keep replies short — people use this on the phone at site. Money as ₹ in Indian format (₹1,25,000).

DOING THINGS
- Write actions (create_task, update_task_status, add_task_comment, create_bug_report) are NOT executed by you. Calling them creates a confirm card the user taps. After calling, tell the user briefly what you prepared and ask them to confirm on the card. Never claim it is already done.
- Before assigning a task, resolve the person with find_user. If several people match, or none, ask which one. "me"/"myself"/"எனக்கு" = the current user.
- Required for a task: what to do + who does it. If either is missing, ask ONE short question at a time. Priority (high/medium/low), size (small/medium/large = "big") and due date: use what the user said; if not said, use defaults (medium, small, today) — they can edit on the card.
- Map words: "urgent/அவசரம்/immediately" → high; "big work/பெரிய வேலை/multi-day" → large; "tomorrow/நாளைக்கு" → tomorrow's date.
- Task titles: short English imperative ("Call cement dealer for rate"). Put extra details or the user's original Tamil words in description.
- For "what are my tasks / what's pending for Ajit / mark X done", use list_tasks to find the task id first. Never invent ids.
- Several tasks in one message → call create_task once per task.
- If a tool returns an error, fix the arguments or ask the user; do not give up silently.
${ctx.me.role === "admin" ? `
STAFF PAY (admin only, private)
- "Paid Ajit 25,000 salary for October", "Diwali bonus 5000 to Ajit", "incentive 2000" → find_user, then record_staff_payment (one call per payment). Salary needs the month it is for; if not said, assume the previous month when paid in the first half of a month, otherwise the current month, and say so.
- "How much have I paid Ajit so far?" → staff_pay_summary.
- Never reveal one staff member's pay to anyone else.` : `
- Staff pay is private. You may only tell the user about their own pay (staff_pay_summary with their own user_id).`}

DATA QUESTIONS
- Use the data tools before giving any number. If nothing is found, say so — never guess.
- For cross-site questions with no site selected, pass company_id ${ctx.companyId}.`;
}

async function loadMe(supabase: any): Promise<{ me: AssistantUser; companyId: string } | { error: string; status: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 };
  const { data: row } = await supabase.from("users").select("id, name, role").eq("auth_id", user.id).single();
  if (!row?.id) return { error: "User profile not found", status: 403 };
  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", row.id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .single();
  if (!membership?.company_id) return { error: "User has no company membership", status: 403 };
  return { me: { id: row.id, name: row.name, role: row.role as UserRole }, companyId: membership.company_id };
}

export async function POST(request: NextRequest): Promise<NextResponse<AssistantResponse>> {
  const fail = (error: string, status = 500) => NextResponse.json<AssistantResponse>({ answer: "", actions: [], error }, { status });

  try {
    const body = (await request.json()) as AssistantRequest;
    if (!body.message?.trim() && !body.audio?.data) return fail("Say or type something", 400);
    if (body.audio?.data && body.audio.data.length > MAX_AUDIO_B64) return fail("Recording is too long", 413);
    if (!isGeminiConfigured()) return fail("Assistant is not configured (GEMINI_API_KEY)", 503);

    const supabase = (await createClient()) as any;
    const who = await loadMe(supabase);
    if ("error" in who) return fail(who.error, who.status);
    const { me, companyId } = who;

    // 1. Voice → text (keeps transcript visible + lets history be plain text).
    let userText = body.message?.trim() ?? "";
    let transcript: AssistantResponse["transcript"];
    if (!userText && body.audio?.data) {
      const t = await transcribeAudioBase64(body.audio.data, body.audio.mimeType);
      if (!t.transcript) {
        return NextResponse.json<AssistantResponse>({
          answer: "I couldn't hear anything clearly. Please try again. / சரியாக கேட்கவில்லை, மீண்டும் சொல்லுங்கள்.",
          actions: [],
        });
      }
      transcript = { text: t.transcript, language: t.language, text_en: t.transcript_en };
      userText = t.transcript;
    }

    // 2. Conversation — must start with a user turn and alternate roles,
    //    so merge consecutive same-role items (e.g. a confirm note after a reply).
    const contents: Content[] = [];
    for (const h of [...(body.history ?? []).slice(-MAX_HISTORY), { role: "user" as const, content: userText }]) {
      const role = h.role === "assistant" ? "model" : "user";
      const text = String(h.content ?? "").slice(0, 4000);
      if (!text) continue;
      if (!contents.length && role === "model") continue;
      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        last.parts = [{ text: `${last.parts?.[0]?.text ?? ""}\n${text}` }];
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }

    const ai = getGemini();
    const config = {
      systemInstruction: systemPrompt({
        me,
        companyId,
        siteId: body.siteId,
        siteName: body.siteName,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
      }),
      temperature: 0.2,
      maxOutputTokens: 1024,
      tools: [{ functionDeclarations: [...toolsForRole(me.role), ...READ_DECLARATIONS] }],
    };

    const actions: AssistantActionCard[] = [];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await ai.models.generateContent({ model: GEMINI_MODEL, contents, config });
      const calls = res.functionCalls ?? [];
      const modelContent = res.candidates?.[0]?.content;

      if (!calls.length) {
        const answer = (res.text ?? "").trim() || (actions.length ? "Please confirm below." : "Sorry, I couldn't answer that.");
        return NextResponse.json<AssistantResponse>({ answer, transcript, actions });
      }

      // Keep the model turn verbatim (includes thought signatures).
      if (modelContent) contents.push(modelContent);

      const responses: Part[] = await Promise.all(
        calls.map(async (call): Promise<Part> => {
          const name = call.name ?? "";
          const args = (call.args ?? {}) as Record<string, unknown>;
          let response: Record<string, unknown>;
          try {
            if (WRITE_TOOL_NAMES.has(name)) {
              const r = await proposeAction(supabase, me, name, args, transcript?.text ?? userText);
              if ("error" in r) {
                response = { error: r.error };
              } else {
                actions.push({ id: r.action.id, tool: name, summary: r.action.summary, status: "proposed" });
                response = { status: "awaiting_user_confirmation", summary: r.action.summary };
              }
            } else if (LOOKUP_TOOL_NAMES.has(name)) {
              response = { result: await runLookup(supabase, me, name, args) };
            } else {
              const raw = await executeTool(name, args, supabase);
              try {
                response = { result: JSON.parse(raw) };
              } catch {
                response = { result: raw };
              }
            }
          } catch (err) {
            response = { error: err instanceof Error ? err.message : "Tool failed" };
          }
          return { functionResponse: { id: call.id, name, response } };
        })
      );
      contents.push({ role: "user", parts: responses });
    }

    return NextResponse.json<AssistantResponse>({
      answer: actions.length ? "Please confirm below." : "That took too many steps — please ask in a simpler way.",
      transcript,
      actions,
    });
  } catch (err) {
    console.error("[/api/assistant] error:", err);
    return fail(err instanceof Error ? err.message : "Unexpected error");
  }
}
