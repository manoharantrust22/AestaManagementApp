/**
 * Design tokens for the Material Hub redesign.
 *
 * Mapped onto the existing Aesta MUI theme palette ([src/theme/theme.ts])
 * so the redesign feels native to the app rather than copying the prototype's
 * blue/pink/amber palette verbatim. The semantic names (primary/success/warn/
 * danger/pink) match the prototype's `T` object in
 * docs/MaterialHub_Redesign/utils.jsx so other component code maps 1:1.
 */
export const hubTokens = {
  // Layout — mirror MUI light palette defaults
  bg: "#f5f5f5",                  // background.default
  card: "#ffffff",                // background.paper
  text: "rgba(0, 0, 0, 0.87)",    // text.primary
  muted: "rgba(0, 0, 0, 0.6)",    // text.secondary
  subtle: "rgba(0, 0, 0, 0.38)",  // text.disabled
  border: "rgba(0, 0, 0, 0.12)",  // divider
  hairline: "rgba(0, 0, 0, 0.06)",
  chip: "#f5f5f5",

  // Primary — MUI palette.primary (#1976d2 / #1565c0)
  primary: "#1976d2",
  primarySoft: "rgba(25, 118, 210, 0.08)",
  primaryHover: "#1565c0",

  // Success — MUI palette.success (#2e7d32)
  success: "#2e7d32",
  successSoft: "rgba(46, 125, 50, 0.08)",

  // Warn — MUI palette.warning (#ed6c02)
  warn: "#ed6c02",
  warnSoft: "rgba(237, 108, 2, 0.10)",

  // Danger — MUI palette.error (#d32f2f)
  danger: "#d32f2f",
  dangerSoft: "rgba(211, 47, 47, 0.08)",

  // Pink — MUI palette.secondary (#dc004e). Used as the group/cluster accent
  // throughout the Hub. Same role as the prototype's pink, but uses the app's
  // secondary so it feels consistent with the rest of the UI.
  pink: "#dc004e",
  pinkSoft: "rgba(220, 0, 78, 0.08)",

  // Typography
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

export type HubTone = "neutral" | "primary" | "pink" | "success" | "warn" | "danger";

export function hubToneColors(tone: HubTone) {
  switch (tone) {
    case "primary":
      return { bg: hubTokens.primarySoft, fg: hubTokens.primary, dot: hubTokens.primary };
    case "pink":
      return { bg: hubTokens.pinkSoft, fg: hubTokens.pink, dot: hubTokens.pink };
    case "success":
      return { bg: hubTokens.successSoft, fg: hubTokens.success, dot: hubTokens.success };
    case "warn":
      return { bg: hubTokens.warnSoft, fg: hubTokens.warn, dot: hubTokens.warn };
    case "danger":
      return { bg: hubTokens.dangerSoft, fg: hubTokens.danger, dot: hubTokens.danger };
    default:
      return { bg: hubTokens.chip, fg: hubTokens.muted, dot: hubTokens.subtle };
  }
}

export const HUB_BREAKPOINT_PX = 820;
