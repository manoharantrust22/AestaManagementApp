/**
 * Assistant "do things" tools.
 *
 * Two kinds:
 *  - LOOKUP tools (find_user, list_tasks) run immediately and return data.
 *  - WRITE tools never run immediately. `proposeAction` validates the args,
 *    resolves names, and stores an `assistant_actions` row (status
 *    'proposed') with a human-readable summary. The user confirms in the UI,
 *    then `/api/assistant/confirm` calls `executeAction` with the user's own
 *    Supabase session, so RLS still decides what is allowed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<any, any, any>;

export type UserRole = "admin" | "office" | "site_engineer";

export interface AssistantUser {
  id: string; // users.id
  name: string;
  role: UserRole;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

const PRIORITIES = ["high", "medium", "low"] as const;
const SIZES = ["small", "medium", "large"] as const;
const STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
const CATEGORIES = ["app", "inquiry", "site", "office", "other"] as const;

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

export const LOOKUP_TOOLS: ToolDeclaration[] = [
  {
    name: "find_user",
    description:
      "Find app users (staff) by name, e.g. 'Ajit', 'office', 'me'. Always call this to get a user_id before assigning a task or recording a payment. Returns id, name, role and assigned sites.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or part of a name. Use 'me' for the current user." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List tasks. scope 'mine' = assigned to the current user, 'assigned_by_me' = created by the current user for others, 'person' = assigned to user_id (admin can see anyone; others only tasks they are part of). Returns id, title, status, priority, size, due_date, assignee, creator.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["mine", "assigned_by_me", "person"] },
        user_id: { type: "string", description: "Required when scope = 'person'." },
        status: { type: "string", enum: ["open", ...STATUSES, "any"], description: "Default 'open' (todo, in_progress, blocked)." },
        search: { type: "string", description: "Optional words in the title." },
      },
      required: ["scope"],
    },
  },
];

LOOKUP_TOOLS.push({
  name: "staff_pay_summary",
  description:
    "How much a staff member (site engineer / office) has been paid: salary, incentives, bonuses, advances, with totals for this financial year and recent payments. Admins can ask about anyone; others only about themselves.",
  parametersJsonSchema: {
    type: "object",
    properties: { user_id: { type: "string", description: "users.id from find_user (or the current user)." } },
    required: ["user_id"],
  },
});

export const WRITE_TOOLS: Array<ToolDeclaration & { roles?: UserRole[] }> = [
  {
    name: "create_task",
    description:
      "Propose assigning a new task to someone (or to self). The user will see a confirm card. Defaults: priority 'medium', size 'small', due today (Asia/Kolkata). Ask the user if who or what is unclear.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short imperative title in English, max ~90 chars." },
        assignee_id: { type: "string", description: "users.id from find_user." },
        description: { type: "string", description: "Extra details (optional). Keep the user's own words if Tamil." },
        priority: { type: "string", enum: [...PRIORITIES] },
        size: { type: "string", enum: [...SIZES], description: "small = quick, medium = some hours, large = big / multi-day job." },
        due_date: { type: "string", description: "YYYY-MM-DD, or 'none' for no date." },
        site_id: { type: "string", description: "Optional site id when the task is about a specific site." },
        category: { type: "string", enum: [...CATEGORIES] },
      },
      required: ["title", "assignee_id"],
    },
  },
  {
    name: "update_task_status",
    description:
      "Propose changing a task's status (start, done, blocked, reopen, cancel). Moving to 'blocked' needs a note explaining the problem. Get the task_id from list_tasks first.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: [...STATUSES] },
        note: { type: "string", description: "Reason / update text. Required for 'blocked'." },
      },
      required: ["task_id", "status"],
    },
  },
  {
    name: "add_task_comment",
    description: "Propose adding an update/comment to an existing task's thread.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        text: { type: "string" },
      },
      required: ["task_id", "text"],
    },
  },
  {
    name: "create_bug_report",
    description:
      "Propose reporting a problem with the app to the admin (no screenshot). Use when the user describes something broken or confusing in the app.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short English summary of the problem." },
        details: { type: "string", description: "What happened, which screen, what they expected." },
        priority: { type: "string", enum: [...PRIORITIES] },
      },
      required: ["title"],
    },
  },
  {
    name: "record_staff_payment",
    roles: ["admin"],
    description:
      "ADMIN ONLY. Propose recording money the company paid to a staff member (site engineer/supervisor/office): monthly salary, incentive, bonus (e.g. Diwali bonus), advance. It is private (only admin + that person see it) and is charged to the person's assigned sites by an equal split. One call per payment.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        staff_user_id: { type: "string", description: "users.id from find_user." },
        payment_type: { type: "string", enum: ["salary", "incentive", "bonus", "advance", "other"] },
        amount: { type: "number", description: "Rupees." },
        paid_on: { type: "string", description: "YYYY-MM-DD, default today." },
        period_month: { type: "string", description: "For salary: the month it is for, YYYY-MM." },
        payment_mode: { type: "string", enum: ["cash", "upi", "bank"] },
        notes: { type: "string", description: "e.g. 'Diwali bonus'." },
      },
      required: ["staff_user_id", "payment_type", "amount"],
    },
  },
];

export function toolsForRole(role: UserRole): ToolDeclaration[] {
  return [
    ...LOOKUP_TOOLS,
    ...WRITE_TOOLS.filter((t) => !t.roles || t.roles.includes(role)).map(({ roles: _r, ...t }) => t),
  ];
}

export const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));
export const LOOKUP_TOOL_NAMES = new Set(LOOKUP_TOOLS.map((t) => t.name));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function fmtDate(d: string | null): string {
  if (!d) return "no due date";
  if (d === todayIST()) return "due today";
  const dt = new Date(`${d}T00:00:00+05:30`);
  return `due ${dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}`;
}

class ToolInputError extends Error {}

async function getUser(db: Db, id: unknown): Promise<{ id: string; name: string; role: string } | null> {
  const s = str(id);
  if (!s || !UUID_RE.test(s)) return null;
  const { data } = await db.from("users").select("id, name, role").eq("id", s).maybeSingle();
  return (data as { id: string; name: string; role: string } | null) ?? null;
}

async function getTask(db: Db, id: unknown) {
  const s = str(id);
  if (!s || !UUID_RE.test(s)) return null;
  const { data } = await db.from("tasks").select("id, title, status, created_by, assignee_id").eq("id", s).maybeSingle();
  return (data as { id: string; title: string; status: string; created_by: string; assignee_id: string } | null) ?? null;
}

async function resolveBugOwner(db: Db, me: AssistantUser): Promise<string> {
  if (me.role === "admin") return me.id;
  const email = process.env.NEXT_PUBLIC_BUG_REPORT_ASSIGNEE_EMAIL;
  if (email) {
    const { data } = await db.from("users").select("id").ilike("email", email).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data: admins } = await db
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  return (admins?.[0]?.id as string | undefined) ?? me.id;
}

// ---------------------------------------------------------------------------
// Lookups (run immediately)
// ---------------------------------------------------------------------------

export async function runLookup(db: Db, me: AssistantUser, name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "find_user") {
    const q = (str(args.query) ?? "").toLowerCase();
    const { data, error } = await db.from("users").select("id, name, role, status, assigned_sites").order("name");
    if (error) return { error: error.message };
    const users = ((data ?? []) as Array<{ id: string; name: string; role: string; status: string | null; assigned_sites: string[] | null }>).filter(
      (u) => !u.status || u.status === "active"
    );
    if (q === "me" || q === "myself" || q === "self") {
      const u = users.find((x) => x.id === me.id);
      return { matches: u ? [{ id: u.id, name: u.name, role: u.role, is_me: true }] : [] };
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = users
      .filter((u) => tokens.every((t) => u.name.toLowerCase().includes(t)) || (!!q && u.role.includes(q)))
      .slice(0, 8)
      .map((u) => ({ id: u.id, name: u.name, role: u.role, is_me: u.id === me.id, assigned_site_count: u.assigned_sites?.length ?? 0 }));
    if (!matches.length) {
      return {
        matches: [],
        hint: "No match. All active users: " + users.map((u) => `${u.name} (${u.role})`).join(", "),
      };
    }
    return { matches };
  }

  if (name === "list_tasks") {
    const scope = oneOf(args.scope, ["mine", "assigned_by_me", "person"] as const, "mine");
    const status = str(args.status) ?? "open";
    let q = db
      .from("tasks")
      .select("id, title, status, priority, size, due_date, blocker_note, assignee:users!tasks_assignee_id_fkey(name), creator:users!tasks_created_by_fkey(name)")
      .order("updated_at", { ascending: false })
      .limit(25);
    if (scope === "mine") q = q.eq("assignee_id", me.id);
    if (scope === "assigned_by_me") q = q.eq("created_by", me.id);
    if (scope === "person") {
      const uid = str(args.user_id);
      if (!uid || !UUID_RE.test(uid)) return { error: "user_id is required for scope 'person' (use find_user)" };
      q = q.eq("assignee_id", uid);
    }
    if (status === "open") q = q.in("status", ["todo", "in_progress", "blocked"]);
    else if (status !== "any") q = q.eq("status", status);
    const search = str(args.search);
    if (search) q = q.ilike("title", `%${search.replace(/[%_]/g, "")}%`);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return { today: todayIST(), tasks: data ?? [] };
  }

  if (name === "staff_pay_summary") {
    const uid = str(args.user_id);
    if (!uid || !UUID_RE.test(uid)) return { error: "user_id required (use find_user)" };
    if (me.role !== "admin" && uid !== me.id) return { error: "You can only see your own pay" };
    const now = new Date();
    const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = `${fyYear}-04-01`;
    const { data, error } = await db
      .from("staff_payments")
      .select("payment_type, amount, paid_on, period_month, notes")
      .eq("staff_user_id", uid)
      .order("paid_on", { ascending: false })
      .limit(200);
    if (error) return { error: error.message };
    const rows = (data ?? []) as Array<{ payment_type: string; amount: number; paid_on: string; period_month: string | null; notes: string | null }>;
    const fy = rows.filter((r) => r.paid_on >= fyStart);
    const byType: Record<string, number> = {};
    fy.forEach((r) => (byType[r.payment_type] = (byType[r.payment_type] ?? 0) + Number(r.amount)));
    const { data: prof } = await db
      .from("staff_salary_profiles")
      .select("monthly_salary, effective_from")
      .eq("staff_user_id", uid)
      .lte("effective_from", todayIST())
      .order("effective_from", { ascending: false })
      .limit(1);
    return {
      financial_year_from: fyStart,
      fy_total: fy.reduce((a, r) => a + Number(r.amount), 0),
      fy_by_type: byType,
      all_time_total: rows.reduce((a, r) => a + Number(r.amount), 0),
      monthly_salary: prof?.[0]?.monthly_salary ?? null,
      recent: rows.slice(0, 10),
    };
  }

  return { error: `Unknown lookup tool ${name}` };
}

// ---------------------------------------------------------------------------
// Proposals (validate + summarise, store as 'proposed')
// ---------------------------------------------------------------------------

export interface ProposedAction {
  id: string;
  tool: string;
  summary: string;
  args: Record<string, unknown>;
  status: "proposed";
}

/** Validate + normalise args and build the confirm-card summary. Throws ToolInputError for the model to fix. */
async function prepare(db: Db, me: AssistantUser, tool: string, raw: Record<string, unknown>) {
  if (tool === "create_task") {
    const title = str(raw.title);
    if (!title) throw new ToolInputError("title is required — ask the user what the task is");
    const assignee = await getUser(db, raw.assignee_id);
    if (!assignee) throw new ToolInputError("assignee_id is not a valid user id — call find_user first");
    const dueRaw = str(raw.due_date);
    let due: string | null = todayIST();
    if (dueRaw === "none") due = null;
    else if (dueRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) throw new ToolInputError("due_date must be YYYY-MM-DD or 'none'");
      due = dueRaw;
    }
    let siteName: string | null = null;
    const siteId = str(raw.site_id);
    if (siteId) {
      if (!UUID_RE.test(siteId)) throw new ToolInputError("site_id must be a site uuid, or omit it");
      const { data: site } = await db.from("sites").select("name").eq("id", siteId).maybeSingle();
      if (!site) throw new ToolInputError("site_id not found");
      siteName = site.name as string;
    }
    const args = {
      title: title.slice(0, 200),
      assignee_id: assignee.id,
      description: str(raw.description) ?? null,
      priority: oneOf(raw.priority, PRIORITIES, "medium"),
      size: oneOf(raw.size, SIZES, "small"),
      due_date: due,
      site_id: siteId ?? null,
      category: oneOf(raw.category, CATEGORIES, "other"),
    };
    const who = assignee.id === me.id ? "yourself" : assignee.name;
    const sizeLabel = args.size === "large" ? "big" : args.size;
    const summary = `Assign "${args.title}" to ${who} · ${args.priority} priority · ${sizeLabel} task · ${fmtDate(due)}${siteName ? ` · ${siteName}` : ""}`;
    return { args, summary };
  }

  if (tool === "update_task_status") {
    const task = await getTask(db, raw.task_id);
    if (!task) throw new ToolInputError("task_id not found or not visible — call list_tasks first");
    const status = oneOf(raw.status, STATUSES, "todo");
    if (typeof raw.status !== "string" || !(STATUSES as readonly string[]).includes(raw.status)) {
      throw new ToolInputError(`status must be one of ${STATUSES.join(", ")}`);
    }
    const note = str(raw.note) ?? null;
    if (status === "blocked" && !note) throw new ToolInputError("A note explaining the blocker is required — ask the user what is stopping them");
    if (task.status === status) throw new ToolInputError(`Task is already ${status}`);
    const verb: Record<string, string> = {
      todo: "Reopen",
      in_progress: "Start",
      blocked: "Mark blocked",
      done: "Mark done",
      cancelled: "Cancel",
    };
    return {
      args: { task_id: task.id, from_status: task.status, status, note },
      summary: `${verb[status]}: "${task.title}"${note ? ` — ${note}` : ""}`,
    };
  }

  if (tool === "add_task_comment") {
    const task = await getTask(db, raw.task_id);
    if (!task) throw new ToolInputError("task_id not found or not visible — call list_tasks first");
    const text = str(raw.text);
    if (!text) throw new ToolInputError("text is required");
    return { args: { task_id: task.id, text }, summary: `Add update to "${task.title}": ${text}` };
  }

  if (tool === "create_bug_report") {
    const title = str(raw.title);
    if (!title) throw new ToolInputError("title is required");
    return {
      args: { title: title.slice(0, 200), details: str(raw.details) ?? null, priority: oneOf(raw.priority, PRIORITIES, "medium") },
      summary: `Report app problem: "${title}"`,
    };
  }

  if (tool === "record_staff_payment") {
    const staff = await getUser(db, raw.staff_user_id);
    if (!staff) throw new ToolInputError("staff_user_id is not a valid user — call find_user first");
    const types = ["salary", "incentive", "bonus", "advance", "other"] as const;
    if (typeof raw.payment_type !== "string" || !(types as readonly string[]).includes(raw.payment_type)) {
      throw new ToolInputError(`payment_type must be one of ${types.join(", ")} — ask the user`);
    }
    const amount = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
    if (!(amount > 0)) throw new ToolInputError("amount must be a positive number of rupees — ask the user");
    const paidOn = str(raw.paid_on) ?? todayIST();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new ToolInputError("paid_on must be YYYY-MM-DD");
    let period: string | null = null;
    const pm = str(raw.period_month);
    if (raw.payment_type === "salary") {
      const m = pm ?? paidOn.slice(0, 7);
      if (!/^\d{4}-\d{2}/.test(m)) throw new ToolInputError("period_month must be YYYY-MM");
      period = `${m.slice(0, 7)}-01`;
    }
    const mode = oneOf(raw.payment_mode, ["cash", "upi", "bank"] as const, "upi");
    const notes = str(raw.notes) ?? null;
    const typeLabel = raw.payment_type.charAt(0).toUpperCase() + raw.payment_type.slice(1);
    const periodLabel = period
      ? ` for ${new Date(`${period}T00:00:00+05:30`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`
      : "";
    const amt = `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    return {
      args: { staff_user_id: staff.id, payment_type: raw.payment_type, amount, paid_on: paidOn, period_month: period, payment_mode: mode, notes },
      summary: `${typeLabel}${periodLabel}: ${amt} to ${staff.name} · ${mode.toUpperCase()} · paid ${paidOn}${notes ? ` · ${notes}` : ""} (private, split across their sites)`,
    };
  }

  throw new ToolInputError(`Unknown tool ${tool}`);
}

/**
 * Returns either the stored proposal or an error string for the model.
 */
export async function proposeAction(
  db: Db,
  me: AssistantUser,
  tool: string,
  raw: Record<string, unknown>,
  transcript: string | null
): Promise<{ action: ProposedAction } | { error: string }> {
  const decl = WRITE_TOOLS.find((t) => t.name === tool);
  if (!decl) return { error: `Unknown tool ${tool}` };
  if (decl.roles && !decl.roles.includes(me.role)) return { error: "You are not allowed to do this" };
  try {
    const { args, summary } = await prepare(db, me, tool, raw);
    const { data, error } = await db
      .from("assistant_actions")
      .insert({ user_id: me.id, tool, args, summary, transcript })
      .select("id")
      .single();
    if (error) return { error: `Could not store proposal: ${error.message}` };
    return { action: { id: data.id as string, tool, summary, args, status: "proposed" } };
  } catch (err) {
    if (err instanceof ToolInputError) return { error: err.message };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Execution (after the user confirms)
// ---------------------------------------------------------------------------

export async function executeAction(
  db: Db,
  me: AssistantUser,
  tool: string,
  args: Record<string, any>
): Promise<{ message: string; task_id?: string; url?: string }> {
  if (tool === "create_task") {
    const { data, error } = await db
      .from("tasks")
      .insert({ ...args, created_by: me.id, source: "assistant" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { message: "Task assigned", task_id: data.id, url: `/tasks?id=${data.id}` };
  }

  if (tool === "update_task_status") {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "blocked") patch.blocker_note = args.note;
    const { data: updated, error } = await db.from("tasks").update(patch).eq("id", args.task_id).select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("You can't change this task");
    const { error: e2 } = await db.from("task_updates").insert({
      task_id: args.task_id,
      author_id: me.id,
      kind: args.status === "blocked" ? "blocker" : args.status === "done" ? "resolution" : "status_change",
      body: args.note ?? null,
      from_status: args.from_status ?? null,
      to_status: args.status,
    });
    if (e2) throw new Error(e2.message);
    return { message: "Task updated", task_id: args.task_id, url: `/tasks?id=${args.task_id}` };
  }

  if (tool === "add_task_comment") {
    const { error } = await db.from("task_updates").insert({ task_id: args.task_id, author_id: me.id, kind: "comment", body: args.text });
    if (error) throw new Error(error.message);
    return { message: "Update added", task_id: args.task_id, url: `/tasks?id=${args.task_id}` };
  }

  if (tool === "create_bug_report") {
    const assignee = await resolveBugOwner(db, me);
    const { data, error } = await db
      .from("tasks")
      .insert({
        title: args.title,
        description: args.details,
        priority: args.priority,
        size: "small",
        category: "app",
        source: "bug_report",
        due_date: null,
        created_by: me.id,
        assignee_id: assignee,
        context: { via: "assistant" },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { message: "Problem reported", task_id: data.id, url: `/tasks?id=${data.id}` };
  }

  if (tool === "record_staff_payment") {
    if (me.role !== "admin") throw new Error("Only admins can record staff payments");
    const { error } = await db.rpc("record_staff_payment", {
      p_staff_user_id: args.staff_user_id,
      p_payment_type: args.payment_type,
      p_amount: args.amount,
      p_paid_on: args.paid_on,
      p_period_month: args.period_month,
      p_payment_mode: args.payment_mode,
      p_notes: args.notes,
      p_allocation: null,
    });
    if (error) throw new Error(error.message);
    return { message: "Payment recorded", url: "/company/staff-pay" };
  }

  throw new Error(`Unknown tool ${tool}`);
}
