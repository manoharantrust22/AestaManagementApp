"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamTaskSummary } from "@/hooks/queries/useTasks";

/** Admin dashboard strip: what the team is stuck on right now. */
export default function TeamTasksSummaryCard() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";
  const { data } = useTeamTaskSummary(isAdmin);
  if (!isAdmin || !data) return null;

  const chips: Array<{ label: string; n: number; color: "default" | "error" | "warning" | "success" | "info" }> = [
    { label: "Blocked", n: data.blocked, color: "error" },
    { label: "Overdue", n: data.overdue, color: "warning" },
    { label: "Open bugs", n: data.openBugs, color: "info" },
    { label: "Open", n: data.open, color: "default" },
    { label: "Done today", n: data.doneToday, color: "success" },
  ];

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: "12px !important" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <GroupsIcon color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Team tasks
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          {chips.map((c) => (
            <Chip
              key={c.label}
              label={`${c.n} ${c.label}`}
              color={c.n > 0 ? c.color : "default"}
              variant={c.n > 0 && c.color !== "default" ? "filled" : "outlined"}
              onClick={() => router.push("/tasks")}
              clickable
            />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
