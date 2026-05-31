/**
 * Derive a stable, per-site-unique `key` for a payer source from its
 * human label. Keys are snake_case, alphanumeric-only, and de-duplicated
 * against the keys already present on the site by appending _2, _3, …
 *
 * The key is the persisted identity of the source (stored in
 * settlement_groups.payer_source / wallet deposits), so it must never
 * change once created — only the label is editable later.
 */
export function slugifyPayerSourceKey(
  label: string,
  existingKeys: string[] = [],
): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "source";

  if (!existingKeys.includes(base)) return base;
  let i = 2;
  while (existingKeys.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
