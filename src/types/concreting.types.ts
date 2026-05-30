import type { Database } from "@/types/database.types";

/**
 * Concreting Teams catalog — company-wide directory of external concreting gangs
 * hired for single-day, lump-sum concreting jobs (subcontracts with
 * contract_type='day_work'). See migration 20260530200000_concreting_teams.sql.
 */
export type ConcretingTeam =
  Database["public"]["Tables"]["concreting_teams"]["Row"];

/** Form shape for creating / editing a concreting team. */
export interface ConcretingTeamFormData {
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  area?: string | null;
  brings_own_machine?: boolean;
  typical_rate?: number | null;
  notes?: string | null;
}
