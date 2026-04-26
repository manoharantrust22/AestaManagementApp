// Identifies the "thing" the pane is showing. Two shapes today:
// - daily-date  : one date (settled or pending), all laborers paid that day
// - weekly-week : one laborer × one week (Mon–Sun)
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
