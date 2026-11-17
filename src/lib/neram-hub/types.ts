/**
 * Task hub v1 shapes, as Neram Admin sends and accepts them.
 * Source of truth: Neram repo, apps/admin/Docs/TASK_HUB_CONTRACT.md
 * (and apps/admin/src/lib/hub/contract.ts). Within v1 fields may be added,
 * never removed or renamed.
 *
 * Types only: safe to import from browser code. The client that talks to the
 * hub is server-only (./client.ts).
 *
 * People are always Aesta's own ids (`users.id`), called externalId here.
 */

export type HubStatus = "todo" | "doing" | "waiting" | "done" | "cancelled";
export type HubPriority = "low" | "normal" | "high";
/** quick: minutes · short: under an hour or two · half: half a day · big: a day or more */
export type HubSize = "quick" | "short" | "half" | "big";

export interface HubPersonRef {
  /** Aesta's users.id, or null for someone at Neram not linked in Aesta (show the name only). */
  externalId: string | null;
  name: string;
}

export interface HubPage {
  url: string;
  title: string | null;
  siteId: string | null;
  siteName: string | null;
}

export interface HubTask {
  id: string;
  title: string;
  notes: string | null;
  status: HubStatus;
  /** The owner said it is done and waits for the checker's yes. */
  checkAsked: boolean;
  priority: HubPriority;
  size: HubSize | null;
  /** YYYY-MM-DD, India date */
  dueDate: string | null;
  /** HH:MM, India time */
  dueTime: string | null;
  owner: HubPersonRef;
  givenBy: HubPersonRef | null;
  checker: HubPersonRef | null;
  waitingOn: HubPersonRef | null;
  waitingReason: string | null;
  /** Closing it needs a photo or a note. */
  proofRequired: boolean;
  checklist: Array<{ id: string; text: string; done: boolean }>;
  page: HubPage | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
}

export interface HubTaskTime {
  running: boolean;
  startedAt: string | null;
  elapsedSec: number;
  workingSec: number | null;
  basis: string | null;
  stretches: number;
}

export interface HubTaskDetail extends HubTask {
  comments: Array<{ id: string; by: HubPersonRef | null; text: string | null; at: string }>;
  /** Signed links that last an hour. */
  photos: Array<{ name: string; url: string | null }>;
  time: HubTaskTime | null;
}

export interface HubPerson {
  externalId: string;
  name: string;
  kind: "staff" | "outside";
}

export type HubView = "mine" | "given" | "all";
export type HubState = "open" | "closed";

export interface HubNewTask {
  title: string;
  notes?: string | null;
  /** Aesta users.id; defaults to the caller. */
  owner?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: HubPriority;
  size?: HubSize | null;
  /** Must be https and on Aesta's own address. */
  page?: HubPage | null;
}

export type HubCancelReason = "not_needed" | "mistake" | "other";

export type HubAction =
  | { action: "start" }
  | { action: "done"; note?: string }
  | { action: "ask_check"; checker: string; note?: string }
  | { action: "take_back_check" }
  | { action: "approve" }
  | { action: "send_back"; reason: string }
  | { action: "waiting"; on?: string; reason?: string }
  | { action: "put_back" }
  | { action: "cancel"; reason: HubCancelReason }
  | { action: "reassign"; owner: string }
  | {
      action: "edit";
      title?: string;
      notes?: string | null;
      dueDate?: string | null;
      dueTime?: string | null;
      priority?: HubPriority;
      size?: HubSize | null;
    }
  | { action: "still_on" };

export type HubActionName = HubAction["action"];

export interface HubFileUpload {
  name: string;
  type: "image/jpeg" | "image/png" | "image/webp";
  /** base64, at most 3 MB of image (resize on the phone first) */
  data: string;
}

export interface HubRunningTask {
  id: string;
  title: string;
  startedAt: string;
  /** Running since an earlier day: ask "Still on this?" and send still_on. */
  stale: boolean;
  priority: HubPriority;
  dueDate: string | null;
  page: HubPage | null;
}

export interface HubRunning {
  /** The hub's clock. Count elapsed time from this, not the phone's. */
  now: string;
  running: HubRunningTask[];
}

export type HubEventKind =
  | "assigned"
  | "sent_back"
  | "check"
  | "check_ok"
  | "done"
  | "blocked"
  | "waiting_on_you"
  | "comment"
  | "changed";

export interface HubEvent {
  id: number;
  kind: HubEventKind;
  taskId: string | null;
  /** Aesta users.id of the people it is for. */
  to: string[];
  subject: string;
  message: string;
  at: string;
}

export interface HubEventsPage {
  events: HubEvent[];
  /** Pass as `after` next time. */
  next: number;
}

/** Error codes the hub answers with, plus the client's own transport codes. */
export type HubErrorCode =
  | "invalid"
  | "proof"
  | "unsigned"
  | "not_linked"
  | "forbidden"
  | "not_found"
  | "not_ready"
  | "error"
  // client side
  | "not_configured"
  | "timeout"
  | "unreachable";

/** The error shape every /api/neram route and the client use. `error` is shown to the person. */
export interface HubErrorBody {
  error: string;
  code: HubErrorCode;
  field?: string;
}
