/**
 * Stage-stepper filter for the Material Hub.
 *
 * The Hub's per-row pipeline (REQ → PO → DELIVER → STOCK → SETTLE → IN USE;
 * Approve + PO are one combined office step) shows where each thread sits.
 * This module turns that into a *filter*:
 * a condensed set of the steps that actually hold work, the function that buckets
 * a thread into its current step, and the per-step counts (total + how many need
 * action, broken down by who must act).
 *
 * Condensed to the actionable steps only — REQ and STOCK are instant/auto and
 * never hold a waiting thread, so they're omitted. Each step is owned by a role
 * (admin / site engineer / office), reused from `nextAction()`'s `who`, so the
 * UI can colour each step by who's on the hook.
 *
 * Pure (no React) so it stays unit-testable and importable from the page model.
 * Mirrors the shape of `@/lib/workforce/statusTabs.ts`.
 */
import type { MaterialThread } from "./threadTypes";
import type { HubTone } from "./tokens";
import { nextAction, type NextActionWho } from "./nextAction";

export type StageStepKey = "po" | "deliver" | "settle" | "inuse";

/** Who's on the hook at a step — same vocabulary as `nextAction().who`. */
export type StepRole = NextActionWho; // "admin" | "engineer" | "office"

export interface StageStepDef {
  key: StageStepKey;
  /** Short uppercase label shown on the node — mirrors the per-row stepper. */
  label: string;
  /** Canonical owning role — drives the tint and the empty-state fallback. */
  role: StepRole;
  /** Hub tone for the role: admin→pink, engineer→primary, office→warn. */
  tone: HubTone;
  /** Verb for the "N to <verb>" caption, e.g. "2 to approve". */
  verb: string;
}

/** The condensed actionable steps, in pipeline order. Approve + PO are one
 *  combined office step — a pending request's next action IS "Create PO". */
export const STAGE_STEPS: StageStepDef[] = [
  { key: "po", label: "PO", role: "office", tone: "warn", verb: "order" },
  { key: "deliver", label: "DELIVER", role: "engineer", tone: "primary", verb: "deliver" },
  { key: "settle", label: "SETTLE", role: "office", tone: "warn", verb: "settle" },
  { key: "inuse", label: "IN USE", role: "engineer", tone: "primary", verb: "log usage" },
];

export const STAGE_STEP_KEYS: StageStepKey[] = STAGE_STEPS.map((s) => s.key);

export const ROLE_LABEL: Record<StepRole, string> = {
  admin: "Admin",
  engineer: "Engineer",
  office: "Office",
};

/**
 * The step a thread is currently sitting at — the "blue dot" position in the
 * per-row stepper. Derived from `thread.stage` exactly as the pipeline /
 * `nextAction` logic does. Returns null for threads that sit at no actionable
 * step (rejected), so they're excluded from every step bucket.
 */
export function threadCurrentStep(t: MaterialThread): StageStepKey | null {
  // Spot purchases bypass MR/PO/Delivery/Settlement — they're already bought, so
  // they live in the consumption phase.
  if (t.purchase_type === "spot") return "inuse";

  switch (t.stage) {
    // Approve + PO are one combined step: a pending request and an approved-
    // but-unordered request both sit at the PO node waiting on the office.
    case "requested":
    case "approved":
      return "po";
    case "ordered":
    case "in-transit":
      return "deliver";
    case "delivered": {
      // Advance POs were paid at PO creation; once delivered there's no settle
      // step — they jump to usage. Likewise an already-settled delivery.
      const advancePaid =
        !!t.po && t.po.payment_timing === "advance" && t.po.advance_paid > 0;
      const settled = t.settlement?.status === "settled";
      return advancePaid || settled ? "inuse" : "settle";
    }
    case "settled":
    case "in-use":
    case "exhausted":
      return "inuse";
    case "rejected":
    default:
      return null;
  }
}

export interface StepActionCounts {
  admin: number;
  engineer: number;
  office: number;
  /** Total threads at this step that currently need *someone's* action. */
  total: number;
}

export interface StepCount {
  /** Bucket size — the number the filter chip shows. */
  total: number;
  /** Of `total`, how many need action, split by who. */
  action: StepActionCounts;
}

export type StageStepCounts = Record<StageStepKey, StepCount>;

function emptyStepCount(): StepCount {
  return { total: 0, action: { admin: 0, engineer: 0, office: 0, total: 0 } };
}

/**
 * Per-step counts across all threads. `total` is the bucket size; `action` is
 * the action-required subset, broken down by responsible role (via nextAction).
 */
export function stageStepCounts(threads: MaterialThread[]): StageStepCounts {
  const counts: StageStepCounts = {
    po: emptyStepCount(),
    deliver: emptyStepCount(),
    settle: emptyStepCount(),
    inuse: emptyStepCount(),
  };
  for (const t of threads) {
    const step = threadCurrentStep(t);
    if (!step) continue;
    const c = counts[step];
    c.total += 1;
    const action = nextAction(t);
    if (action) {
      c.action[action.who] += 1;
      c.action.total += 1;
    }
  }
  return counts;
}

/**
 * The role to tint a step by: the role with the most pending actions, falling
 * back to the step's canonical owner when nothing is currently actionable (so an
 * idle SETTLE step still reads "office", an idle IN USE still reads "engineer").
 */
export function dominantRole(step: StageStepDef, count: StepCount): StepRole {
  const { admin, engineer, office } = count.action;
  const max = Math.max(admin, engineer, office);
  if (max === 0) return step.role;
  if (office === max) return "office";
  if (engineer === max) return "engineer";
  return "admin";
}
