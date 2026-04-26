// Identifies the "thing" the pane is showing. Four shapes:
// - daily-date       : one date (settled or pending), all laborers paid that day
// - weekly-week      : one laborer × one week (Mon-Sun)
// - weekly-aggregate : one subcontract (or all) × one week (Mon-Sun);
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
      weekStart: string;               // YYYY-MM-DD (Monday)
      weekEnd: string;                 // YYYY-MM-DD (Sunday)
      settlementRef?: string | null;
    }
  | {
      kind: "weekly-aggregate";
      siteId: string;
      subcontractId: string | null;    // null when scoped to all subcontracts on the site
      weekStart: string;               // YYYY-MM-DD (Monday)
      weekEnd: string;                 // YYYY-MM-DD (Sunday)
    }
  | {
      kind: "advance";
      siteId: string;
      settlementId: string;            // 'p:<uuid>' from the ledger row id
      settlementRef: string | null;
    };

export type InspectTabKey = "attendance" | "work-updates" | "settlement" | "audit";

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
