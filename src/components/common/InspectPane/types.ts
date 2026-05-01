// Identifies the "thing" the pane is showing. Four shapes:
// - daily-date       : one date (settled or pending), all laborers paid that day
// - weekly-week      : one laborer × one week (Sun-Sat)
// - weekly-aggregate : one subcontract (or all) × one week (Sun-Sat);
//                      per-day attendance roll-up across all contract laborers
// - advance          : a single outside-waterfall advance settlement;
//                      Attendance + Work Updates tabs are hidden for this kind
export type InspectEntity =
  | {
      kind: "daily-date";
      siteId: string;
      date: string;                    // YYYY-MM-DD
      settlementRef?: string | null;   // null when pending
    }
  | {
      kind: "weekly-week";
      siteId: string;
      laborerId: string;
      weekStart: string;               // YYYY-MM-DD (Sunday)
      weekEnd: string;                 // YYYY-MM-DD (Saturday)
      settlementRef?: string | null;
    }
  | {
      kind: "weekly-aggregate";
      siteId: string;
      subcontractId: string | null;    // null when scoped to all subcontracts on the site
      weekStart: string;               // YYYY-MM-DD (Sunday)
      weekEnd: string;                 // YYYY-MM-DD (Saturday)
      // The page's date scope at the moment the pane was opened. The
      // waterfall is order-dependent — scoping to just a single week
      // omits later settlements that legitimately filled earlier weeks,
      // so the pane re-runs the algorithm over the same range the page
      // saw and then picks the matching week from the result.
      scopeFrom: string | null;
      scopeTo: string | null;
    }
  | {
      kind: "advance";
      siteId: string;
      settlementId: string;            // 'p:<uuid>' from the ledger row id
      settlementRef: string | null;
    };

export type InspectTabKey = "attendance" | "work-updates" | "settlement" | "audit";

// Settlement reference accessor that handles all four entity kinds. Returns
// null for kinds that don't have a settlement_ref (weekly-aggregate is an
// aggregate across multiple settlements). Single source of truth — do not
// duplicate this narrowing at consumer sites.
export function entitySettlementRef(e: InspectEntity): string | null {
  return "settlementRef" in e ? (e.settlementRef ?? null) : null;
}

// Stable identity for an InspectEntity. Used by useInspectPane to detect
// "open same entity again" and by PaymentsLedger to highlight the matching
// row. Single source of truth — do not duplicate this logic at consumer
// sites.
export function entityKey(e: InspectEntity): string {
  if (e.kind === "daily-date")
    return `d:${e.siteId}:${e.date}`;
  if (e.kind === "weekly-week")
    return `w:${e.siteId}:${e.laborerId}:${e.weekStart}`;
  if (e.kind === "weekly-aggregate")
    return `wa:${e.siteId}:${e.subcontractId ?? "_"}:${e.weekStart}`;
  // 'advance'
  return `a:${e.siteId}:${e.settlementId}`;
}

export interface InspectPaneProps {
  entity: InspectEntity | null;
  isOpen: boolean;
  isPinned: boolean;
  activeTab: InspectTabKey;
  onTabChange: (tab: InspectTabKey) => void;
  onClose: () => void;
  onTogglePin: () => void;
  onOpenInPage: (entity: InspectEntity) => void;
  onSettleClick?: (entity: InspectEntity) => void;
}
