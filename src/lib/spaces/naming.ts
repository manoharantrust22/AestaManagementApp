/**
 * Space-name suggestion for quick entry: picking a Type auto-fills the
 * Name so most rooms need no typing. Pure module.
 */

import type { Space, SpaceType } from "@/types/spaces.types";
import { SPACE_TYPE_LABELS } from "@/types/spaces.types";

/** "Bedroom" when first of its type on the site, else "Bedroom N". */
export function suggestSpaceName(
  type: SpaceType,
  existing: Pick<Space, "space_type">[]
): string {
  const label = SPACE_TYPE_LABELS[type];
  const count = existing.filter((s) => s.space_type === type).length;
  return count === 0 ? label : `${label} ${count + 1}`;
}
