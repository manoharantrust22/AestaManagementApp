#!/usr/bin/env node
/**
 * Prints the redirect_uri Supabase sends to Google and Microsoft, through the
 * Cloudflare proxy and directly, so it can be registered with each provider.
 * Run after turning the providers on in Supabase (read-only, signs nobody in):
 *
 *   node scripts/check-oauth-redirect.mjs
 *
 * Also confirms the proxy hands the 302 to the browser (it must not follow it).
 */
const BASES = [
  ["proxy", "https://aesta-supabase-proxy.aestabuilders.workers.dev"],
  ["direct", "https://ocutbpoaibjxtyjkrnda.supabase.co"],
];
const REDIRECT_TO = "https://app.aesta.co.in/auth/callback?next=%2Fsite%2Fdashboard";

for (const provider of ["google", "azure"]) {
  for (const [label, base] of BASES) {
    const url = `${base}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(REDIRECT_TO)}${
      provider === "azure" ? "&scopes=email" : ""
    }`;
    try {
      const res = await fetch(url, { redirect: "manual" });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const target = new URL(loc);
        console.log(`${provider} via ${label}: ${res.status} -> ${target.host}`);
        console.log(`  redirect_uri = ${target.searchParams.get("redirect_uri")}`);
      } else {
        const body = (await res.text()).slice(0, 160).replace(/\s+/g, " ");
        console.log(`${provider} via ${label}: ${res.status} (no redirect) ${body}`);
      }
    } catch (err) {
      console.log(`${provider} via ${label}: request failed: ${err.message}`);
    }
  }
}
