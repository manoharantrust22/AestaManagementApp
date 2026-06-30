import type { WorkPhoto } from "@/types/work-updates.types";

/**
 * Normalise an unknown JSONB value (a `work_updates.morning.photos` / `.evening.photos`
 * array, or an RPC-returned photo list) into a typed `WorkPhoto[]`, dropping anything
 * without a string `url`. Shared by every daily-work consumer (company peek, the
 * site-dashboard "Today by trade" card) so the parsing rule lives in one place.
 */
export function toWorkPhotoArray(v: unknown): WorkPhoto[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (p) => p && typeof p === "object" && typeof (p as { url?: unknown }).url === "string",
    )
    .map((p) => {
      const raw = p as Record<string, unknown>;
      return {
        id: String(raw.id ?? ""),
        url: String(raw.url),
        description: typeof raw.description === "string" ? raw.description : undefined,
        uploadedAt: typeof raw.uploadedAt === "string" ? raw.uploadedAt : "",
      };
    });
}
