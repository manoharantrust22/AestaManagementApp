"use client";

import {
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Block as BlockIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  startOfMonthISO,
  useLaborerProfileSummary,
} from "@/hooks/queries/useLaborerProfileSummary";
import type { LaborerWithDetails } from "@/lib/data/laborers";
import type { Tables } from "@/types/database.types";
import type { LaborSpecialty } from "@/hooks/queries/useLaborSpecialties";
import HeroStats from "./HeroStats";
import RateAndAdvances from "./RateAndAdvances";
import TeamAndMesthri from "./TeamAndMesthri";
import RecentAttendance from "./RecentAttendance";
import WorkHistory from "./WorkHistory";
import MesthriCommissionCollected from "./MesthriCommissionCollected";
import ActiveSubcontracts from "./ActiveSubcontracts";
import PersonalDetails from "./PersonalDetails";

type Team = Tables<"teams">;
type LaborCategory = Tables<"labor_categories">;

interface LaborerProfileDrawerProps {
  open: boolean;
  laborer: LaborerWithDetails | null;
  teams: Team[];
  categories?: LaborCategory[];
  specialties?: LaborSpecialty[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: (laborer: LaborerWithDetails) => void;
  onDeactivate: (laborer: LaborerWithDetails) => void;
}

const DRAWER_WIDTH = 480;

function monthLabel(monthStartISO: string): string {
  const d = new Date(monthStartISO);
  return d.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export default function LaborerProfileDrawer({
  open,
  laborer,
  teams,
  categories = [],
  specialties = [],
  canEdit,
  onClose,
  onEdit,
  onDeactivate,
}: LaborerProfileDrawerProps) {
  const isMobile = useIsMobile();
  const monthStart = startOfMonthISO();
  const {
    data: summary,
    isLoading,
    isError,
    error,
  } = useLaborerProfileSummary(laborer?.id ?? null, monthStart);

  // A laborer is a mesthri if they lead a team (canonical FK or legacy name).
  const isMesthri = Boolean(
    laborer &&
      teams.some(
        (t) =>
          (t as Team & { leader_laborer_id?: string | null })
            .leader_laborer_id === laborer.id ||
          (t.leader_name &&
            t.leader_name.trim().toLowerCase() ===
              laborer.name.trim().toLowerCase())
      )
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: isMobile ? "100%" : DRAWER_WIDTH,
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {laborer && (
        <>
          {/* Sticky Header */}
          <Box
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              bgcolor: "background.paper",
              borderBottom: 1,
              borderColor: "divider",
              px: 2,
              py: 1.5,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Box sx={{ display: "flex", gap: 1.5, minWidth: 0, flex: 1 }}>
                <Avatar
                  src={laborer.photo_url ?? undefined}
                  sx={{ width: 56, height: 56, bgcolor: "primary.light" }}
                >
                  {laborer.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 600,
                      lineHeight: 1.2,
                      wordBreak: "break-word",
                    }}
                  >
                    {laborer.name}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}
                  >
                    {laborer.role_name && (
                      <Chip
                        size="small"
                        label={laborer.role_name}
                        sx={{ height: 20 }}
                      />
                    )}
                    {laborer.category_name && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={laborer.category_name}
                        sx={{ height: 20 }}
                      />
                    )}
                    {/* Additional skills (multi-skill laborers) */}
                    {(laborer.skills ?? [])
                      .filter(
                        (s) =>
                          !s.is_primary &&
                          s.category_id !== laborer.category_id
                      )
                      .map((s) => {
                        const cat = categories.find(
                          (c) => c.id === s.category_id
                        );
                        if (!cat) return null;
                        return (
                          <Chip
                            key={s.category_id}
                            size="small"
                            variant="outlined"
                            color="secondary"
                            label={`+ ${cat.name}`}
                            sx={{ height: 20 }}
                          />
                        );
                      })}
                    {/* Specialties (fine-grained skills) */}
                    {(laborer.specialty_ids ?? []).map((sid) => {
                      const sp = specialties.find((s) => s.id === sid);
                      if (!sp) return null;
                      return (
                        <Chip
                          key={sid}
                          size="small"
                          variant="outlined"
                          color="info"
                          label={sp.name}
                          sx={{ height: 20 }}
                        />
                      );
                    })}
                    <Chip
                      size="small"
                      color={laborer.status === "active" ? "success" : "default"}
                      label={laborer.status === "active" ? "Active" : "Inactive"}
                      sx={{ height: 20 }}
                    />
                  </Stack>
                </Box>
              </Box>
              <Stack direction="row" spacing={0.25}>
                <Tooltip title="Edit">
                  <span>
                    <IconButton
                      size="small"
                      disabled={!canEdit}
                      onClick={() => onEdit(laborer)}
                      aria-label="Edit laborer"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                {laborer.status === "active" && (
                  <Tooltip title="Deactivate">
                    <span>
                      <IconButton
                        size="small"
                        color="warning"
                        disabled={!canEdit}
                        onClick={() => onDeactivate(laborer)}
                        aria-label="Deactivate laborer"
                      >
                        <BlockIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                <Tooltip title="Close">
                  <IconButton
                    size="small"
                    onClick={onClose}
                    aria-label="Close drawer"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            <Box sx={{ mt: 1.5 }}>
              <HeroStats
                summary={summary}
                isLoading={isLoading}
                monthLabel={monthLabel(monthStart)}
              />
            </Box>
          </Box>

          {/* Scrollable body */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              px: 2,
              py: 2,
            }}
          >
            {isError && (
              <Typography color="error" variant="body2" sx={{ mb: 2 }}>
                {(error as Error)?.message ?? "Failed to load profile."}
              </Typography>
            )}

            <Stack spacing={2.5} divider={<Divider flexItem />}>
              <RateAndAdvances laborer={laborer} />
              <TeamAndMesthri laborer={laborer} teams={teams} />
              <WorkHistory laborerId={laborer.id} />
              {isMesthri && (
                <MesthriCommissionCollected laborerId={laborer.id} />
              )}
              <RecentAttendance
                recent={summary?.recent14Days ?? []}
                isLoading={isLoading}
              />
              <ActiveSubcontracts
                associatedTeamId={laborer.associated_team_id}
              />
              <PersonalDetails laborer={laborer} />
            </Stack>
          </Box>
        </>
      )}
    </Drawer>
  );
}
