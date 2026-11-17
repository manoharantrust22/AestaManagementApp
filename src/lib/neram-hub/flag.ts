/**
 * NEXT_PUBLIC_FF_NERAM_TASKS=true moves Aesta's task screens onto Neram's task
 * hub (through /api/neram/*). Off (the default): tasks stay in Aesta's own
 * tables exactly as before. Inlined at build time, so it is a constant and
 * hooks can branch on it without breaking the rules of hooks.
 */
export const NERAM_TASKS_ENABLED = process.env.NEXT_PUBLIC_FF_NERAM_TASKS === "true";
