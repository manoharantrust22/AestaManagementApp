import {
  CheckCircle as RecordedIcon,
  HourglassEmpty as WaitingIcon,
  AccessTime as InProgressIcon,
} from "@mui/icons-material";
import type { SiteRecordedStatus } from "@/hooks/queries/useCompanyDailyPeek";

/**
 * Shared status-chip metadata for a daily-work recorded status. Used by the company
 * "Today across all sites" card (SitePeekCard) and the site-dashboard "Today by trade"
 * card (WorkScopePeek) so both render the same label / colour / icon / accent.
 */
export function recordedStatusMeta(status: SiteRecordedStatus) {
  switch (status) {
    case "recorded":
      return {
        label: "Recorded",
        color: "success" as const,
        icon: <RecordedIcon sx={{ fontSize: 16 }} />,
        borderColor: "success.main",
      };
    case "in_progress":
      return {
        label: "In progress",
        color: "info" as const,
        icon: <InProgressIcon sx={{ fontSize: 16 }} />,
        borderColor: "info.main",
      };
    case "waiting":
    default:
      return {
        label: "Waiting",
        color: "warning" as const,
        icon: <WaitingIcon sx={{ fontSize: 16 }} />,
        borderColor: "warning.main",
      };
  }
}
