import type { TaskPage } from "@/types/task.types";

/** The query parameter that opens a page on a given site (read by SiteProvider). */
export const SITE_PARAM = "site";

/** Generic tab titles that say nothing about the page. */
const GENERIC_TITLES = new Set(["aesta", "aesta construction manager", ""]);

function humanizePath(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() ?? "home";
  const words = last.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Home";
}

/**
 * The page a task created "from this page" points at. The url keeps the path
 * and query, and always carries ?site=<id> of the selected site so the task
 * opens on the right site. Relative (path + query): the server puts it on
 * Aesta's own https address for the hub. Drops ?id= (an open task drawer).
 */
export function buildTaskPage(input: {
  href: string;
  heading?: string | null;
  documentTitle?: string | null;
  site?: { id: string; name: string } | null;
}): TaskPage {
  const u = new URL(input.href, "https://app.local");
  u.searchParams.delete("id");
  if (input.site?.id) u.searchParams.set(SITE_PARAM, input.site.id);
  const heading = input.heading?.replace(/\s+/g, " ").trim();
  const docTitle = input.documentTitle?.replace(/\s*[|·–-]\s*Aesta.*$/i, "").trim() ?? "";
  const title =
    (heading && heading.length <= 80 ? heading : null) ||
    (!GENERIC_TITLES.has(docTitle.toLowerCase()) ? docTitle : null) ||
    humanizePath(u.pathname);
  return {
    url: `${u.pathname}${u.search}`,
    title,
    siteId: input.site?.id ?? null,
    siteName: input.site?.name ?? null,
  };
}

/** The site id asked for in a page's query (?site=<id>), or null. */
export function siteIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get(SITE_PARAM)?.trim();
  return id && /^[0-9a-zA-Z-]{8,64}$/.test(id) ? id : null;
}

/** The same search without ?site= (after the site has been switched). */
export function searchWithoutSite(search: string): string {
  const sp = new URLSearchParams(search);
  sp.delete(SITE_PARAM);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
