"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type {
  ScopePhotoRef,
  Space,
  SpaceFloorPlan,
  SpaceInsert,
  SpaceTileOption,
  SpaceTileOptionInsert,
  SpaceUpdate,
} from "@/types/spaces.types";

// database.types.ts hasn't been regenerated for the new `spaces` /
// `space_floor_plans` tables yet, so the typed query builder can't resolve
// them (TS2589). Cast the client per hook (same pattern as other new-schema
// hooks); query/mutation results are cast to their concrete types inline.
type SupabaseAny = any;

/** Floor (building_section) option used to group spaces. */
export interface SpaceSection {
  id: string;
  name: string;
  sequence_order: number;
}

// ============================================
// QUERIES
// ============================================

export function useSpaces(siteId: string | undefined) {
  const supabase = createClient() as SupabaseAny;

  return useQuery({
    queryKey: siteId ? queryKeys.spaces.bySite(siteId) : queryKeys.spaces.all,
    queryFn: wrapQueryFn(
      async () => {
        if (!siteId) return [] as Space[];
        const { data, error } = await supabase
          .from("spaces")
          .select("*")
          .eq("site_id", siteId)
          .order("section_id", { ascending: true, nullsFirst: false })
          .order("sort_order")
          .order("name");
        if (error) throw error;
        return (data ?? []) as Space[];
      },
      { operationName: "fetchSpaces" }
    ),
    enabled: !!siteId,
  });
}

/** Floors of the site, ordered — used for grouping spaces. */
export function useSpaceSections(siteId: string | undefined) {
  const supabase = createClient() as SupabaseAny;

  return useQuery({
    queryKey: siteId
      ? ([...queryKeys.spaces.bySite(siteId), "sections"] as const)
      : (["spaces", "sections"] as const),
    queryFn: wrapQueryFn(
      async () => {
        if (!siteId) return [] as SpaceSection[];
        const { data, error } = await supabase
          .from("building_sections")
          .select("id, name, sequence_order")
          .eq("site_id", siteId)
          .order("sequence_order");
        if (error) throw error;
        return (data ?? []) as SpaceSection[];
      },
      { operationName: "fetchSpaceSections" }
    ),
    enabled: !!siteId,
  });
}

export function useSpaceFloorPlans(siteId: string | undefined) {
  const supabase = createClient() as SupabaseAny;

  return useQuery({
    queryKey: siteId
      ? queryKeys.spaces.floorPlans(siteId)
      : (["spaces", "floor-plans"] as const),
    queryFn: wrapQueryFn(
      async () => {
        if (!siteId) return [] as SpaceFloorPlan[];
        const { data, error } = await supabase
          .from("space_floor_plans")
          .select("*")
          .eq("site_id", siteId);
        if (error) throw error;
        return (data ?? []) as SpaceFloorPlan[];
      },
      { operationName: "fetchSpaceFloorPlans" }
    ),
    enabled: !!siteId,
  });
}

// ============================================
// MUTATIONS
// ============================================

function useInvalidateSpaces() {
  const queryClient = useQueryClient();
  return (siteId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.spaces.bySite(siteId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.spaces.all, exact: true });
  };
}

export function useCreateSpace() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateSpaces();
  // created_by references public.users(id), NOT auth.users — the auth uid
  // maps via public.users.auth_id, so always stamp with userProfile.id.
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async (input: SpaceInsert) => {
      await ensureFreshSession();
      const { data, error } = await supabase
        .from("spaces")
        .insert({ ...input, created_by: userProfile?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as Space;
    },
    onSuccess: (space) => invalidate(space.site_id),
  });
}

/** Bulk insert for "Import from plan" — one call, all-or-nothing. */
export function useCreateSpacesBulk() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateSpaces();
  // created_by references public.users(id), NOT auth.users — see useCreateSpace.
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      siteId,
      inputs,
    }: {
      siteId: string;
      inputs: SpaceInsert[];
    }) => {
      await ensureFreshSession();
      const { data, error } = await supabase
        .from("spaces")
        .insert(
          inputs.map((i) => ({ ...i, created_by: userProfile?.id ?? null }))
        )
        .select();
      if (error) throw error;
      return (data ?? []) as Space[];
    },
    onSuccess: (_, { siteId }) => invalidate(siteId),
  });
}

export function useUpdateSpace() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateSpaces();

  return useMutation({
    mutationFn: async ({
      id,
      siteId,
      updates,
    }: {
      id: string;
      siteId: string;
      updates: SpaceUpdate;
    }) => {
      await ensureFreshSession();
      const { data, error } = await supabase
        .from("spaces")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Space;
    },
    onSuccess: (_, { siteId }) => invalidate(siteId),
  });
}

/** Assign one floor tile to many spaces at once ("apply to all / unassigned"). */
export function useBulkSetSpaceTile() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateSpaces();

  return useMutation({
    mutationFn: async ({
      siteId,
      ids,
      tileOptionId,
    }: {
      siteId: string;
      ids: string[];
      tileOptionId: string;
    }) => {
      if (ids.length === 0) return [] as Space[];
      await ensureFreshSession();
      const { data, error } = await supabase
        .from("spaces")
        .update({ tile_option_id: tileOptionId })
        .eq("site_id", siteId)
        .in("id", ids)
        .select();
      if (error) throw error;
      return (data ?? []) as Space[];
    },
    onSuccess: (_, { siteId }) => invalidate(siteId),
  });
}

export function useDeleteSpace() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateSpaces();

  return useMutation({
    mutationFn: async ({ id }: { id: string; siteId: string }) => {
      await ensureFreshSession();
      const { error } = await supabase.from("spaces").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { siteId }) => invalidate(siteId),
  });
}

/**
 * Record field-verified dimensions (inches). Stamps verified_by/verified_at
 * with the current user; passing all-null values clears verification.
 */
export function useVerifySpaceDimensions() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateSpaces();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      siteId,
      lengthIn,
      widthIn,
      heightIn,
    }: {
      id: string;
      siteId: string;
      lengthIn: number | null;
      widthIn: number | null;
      heightIn: number | null;
    }) => {
      await ensureFreshSession();
      const cleared =
        lengthIn === null && widthIn === null && heightIn === null;
      const { data, error } = await supabase
        .from("spaces")
        .update({
          verified_length_in: lengthIn,
          verified_width_in: widthIn,
          verified_height_in: heightIn,
          verified_by: cleared ? null : userProfile?.id ?? null,
          verified_at: cleared ? null : new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Space;
    },
    onSuccess: (_, { siteId }) => invalidate(siteId),
  });
}

/**
 * Upsert per-floor metadata (plan image and/or built-up sqft) for a
 * building_section. Only the provided fields are written — an existing
 * plan survives a built-area-only update and vice versa.
 */
export function useUpsertFloorMeta() {
  const supabase = createClient() as SupabaseAny;
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      siteId,
      sectionId,
      plan,
      builtAreaSqft,
    }: {
      siteId: string;
      sectionId: string;
      plan?: ScopePhotoRef | null;
      builtAreaSqft?: number | null;
    }) => {
      await ensureFreshSession();
      const { data, error } = await supabase
        .from("space_floor_plans")
        .upsert(
          {
            site_id: siteId,
            section_id: sectionId,
            ...(plan !== undefined && { plan }),
            ...(builtAreaSqft !== undefined && {
              built_area_sqft: builtAreaSqft,
            }),
            created_by: userProfile?.id ?? null,
          },
          { onConflict: "section_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data as SpaceFloorPlan;
    },
    onSuccess: (_, { siteId }) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.spaces.floorPlans(siteId),
      }),
  });
}

// ============================================
// TILE OPTIONS
// ============================================

export function useTileOptions(siteId: string | undefined) {
  const supabase = createClient() as SupabaseAny;

  return useQuery({
    queryKey: siteId
      ? queryKeys.spaces.tileOptions(siteId)
      : (["spaces", "tile-options"] as const),
    queryFn: wrapQueryFn(
      async () => {
        if (!siteId) return [] as SpaceTileOption[];
        const { data, error } = await supabase
          .from("space_tile_options")
          .select("*")
          .eq("site_id", siteId)
          .order("created_at");
        if (error) throw error;
        return (data ?? []) as SpaceTileOption[];
      },
      { operationName: "fetchTileOptions" }
    ),
    enabled: !!siteId,
  });
}

function useInvalidateTileOptions() {
  const queryClient = useQueryClient();
  return (siteId: string) =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.spaces.tileOptions(siteId),
    });
}

export function useCreateTileOption() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateTileOptions();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async (input: SpaceTileOptionInsert) => {
      await ensureFreshSession();
      const { data, error } = await supabase
        .from("space_tile_options")
        .insert({ ...input, created_by: userProfile?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as SpaceTileOption;
    },
    onSuccess: (opt) => invalidate(opt.site_id),
  });
}

export function useUpdateTileOption() {
  const supabase = createClient() as SupabaseAny;
  const invalidate = useInvalidateTileOptions();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      siteId: string;
      updates: Partial<Omit<SpaceTileOption, "id" | "site_id" | "created_at">>;
    }) => {
      await ensureFreshSession();
      const { data, error } = await supabase
        .from("space_tile_options")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as SpaceTileOption;
    },
    onSuccess: (_, { siteId }) => invalidate(siteId),
  });
}

export function useDeleteTileOption() {
  const supabase = createClient() as SupabaseAny;
  const invalidateTiles = useInvalidateTileOptions();
  const invalidateSpaces = useInvalidateSpaces();

  return useMutation({
    mutationFn: async ({ id }: { id: string; siteId: string }) => {
      await ensureFreshSession();
      const { error } = await supabase
        .from("space_tile_options")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { siteId }) => {
      invalidateTiles(siteId);
      // spaces referencing it go tile_option_id = null via ON DELETE SET NULL
      invalidateSpaces(siteId);
    },
  });
}
