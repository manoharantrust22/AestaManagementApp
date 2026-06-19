// Pure builders for the Task Work completion / reopen update payloads. Kept out
// of the dialog so the rules (reason handling, end-date stamping, waiver) are
// unit-tested. `today` is injected for deterministic tests.

export type CompletionChoice = "no_balance" | "waive" | "owe";

export interface BuildCompletionUpdateArgs {
  choice: CompletionChoice;
  reason: string;
  actualEndDate: string | null;
  today: string;
}

export interface CompletionUpdate {
  status: "completed";
  actual_end_date?: string;
  completion_reason: string | null;
  balance_waived: boolean;
}

export function buildCompletionUpdate({
  choice,
  reason,
  actualEndDate,
  today,
}: BuildCompletionUpdateArgs): CompletionUpdate {
  const update: CompletionUpdate = {
    status: "completed",
    completion_reason: choice === "no_balance" ? null : reason.trim() || null,
    balance_waived: choice === "waive",
  };
  if (!actualEndDate) update.actual_end_date = today;
  return update;
}

export interface ReopenUpdate {
  status: "active";
  balance_waived: false;
  completion_reason: null;
}

export function buildReopenUpdate(): ReopenUpdate {
  return { status: "active", balance_waived: false, completion_reason: null };
}
