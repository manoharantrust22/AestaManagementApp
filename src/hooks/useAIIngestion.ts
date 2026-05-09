/**
 * Mode-agnostic state machine for the AI ingestion dialog.
 *
 * The active ModeConfig is passed per-action rather than at hook construction,
 * because users may pick a mode after the dialog opens. Each action (parse,
 * commit) takes the config it needs at call time.
 */

"use client";

import { useCallback, useMemo, useReducer } from "react";

import { extractJson } from "@/lib/ai-ingestion/extractJson";
import type {
  AnyModeConfig,
  CommitState,
  IngestionContext,
  IngestionMode,
  IngestionStep,
  ResolvedPreview,
} from "@/lib/ai-ingestion/types";
import { ZodError } from "zod";

interface State {
  step: IngestionStep;
  mode: IngestionMode | null;
  ctx: IngestionContext;
  pasteText: string;
  parseError: string | null;
  parsed: unknown | null;
  preview: ResolvedPreview | null;
  commitState: CommitState | null;
  result: unknown | null;
  fatalError: string | null;
}

type Action =
  | { type: "SET_MODE"; mode: IngestionMode }
  | { type: "GO_TO"; step: IngestionStep }
  | { type: "SET_CONTEXT"; ctx: Partial<IngestionContext> }
  | { type: "SET_PASTE"; text: string }
  | { type: "PARSE_OK"; value: unknown; preview: ResolvedPreview }
  | { type: "PARSE_ERR"; error: string }
  | { type: "PREVIEW_PATCH"; patch: (prev: ResolvedPreview) => ResolvedPreview }
  | { type: "COMMIT_PHASE"; state: CommitState }
  | { type: "COMMIT_DONE"; result: unknown }
  | { type: "COMMIT_FAILED"; error: string }
  | { type: "RESET" };

function initial(initialMode: IngestionMode | null, lockedSiteId?: string | null): State {
  return {
    step: initialMode ? "context" : "mode",
    mode: initialMode,
    ctx: {
      siteId: lockedSiteId ?? null,
      defaultDate: new Date().toISOString().slice(0, 10),
      billUrls: [],
      purchaseId: null,
    },
    pasteText: "",
    parseError: null,
    parsed: null,
    preview: null,
    commitState: null,
    result: null,
    fatalError: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode, step: "context" };
    case "GO_TO":
      return { ...state, step: action.step };
    case "SET_CONTEXT":
      return { ...state, ctx: { ...state.ctx, ...action.ctx } };
    case "SET_PASTE":
      return { ...state, pasteText: action.text, parseError: null };
    case "PARSE_OK":
      return {
        ...state,
        parsed: action.value,
        preview: action.preview,
        parseError: null,
        step: "preview",
      };
    case "PARSE_ERR":
      return { ...state, parseError: action.error };
    case "PREVIEW_PATCH":
      return state.preview
        ? { ...state, preview: action.patch(state.preview) }
        : state;
    case "COMMIT_PHASE":
      return { ...state, commitState: action.state, step: "committing" };
    case "COMMIT_DONE":
      return { ...state, result: action.result, step: "done" };
    case "COMMIT_FAILED":
      return {
        ...state,
        fatalError: action.error,
        step: "error",
        commitState: { phase: "failed", message: "Failed", error: action.error },
      };
    case "RESET":
      return initial(state.mode, state.ctx.siteId);
    default:
      return state;
  }
}

export interface UseAIIngestionOptions {
  initialMode?: IngestionMode;
  lockedSiteId?: string | null;
  onSuccess?: (result: unknown) => void;
}

export function useAIIngestion(opts: UseAIIngestionOptions) {
  const [state, dispatch] = useReducer(
    reducer,
    initial(opts.initialMode ?? null, opts.lockedSiteId),
  );

  const setMode = useCallback((mode: IngestionMode) => {
    dispatch({ type: "SET_MODE", mode });
  }, []);

  const setContext = useCallback((ctx: Partial<IngestionContext>) => {
    dispatch({ type: "SET_CONTEXT", ctx });
  }, []);

  const goTo = useCallback((step: IngestionStep) => {
    dispatch({ type: "GO_TO", step });
  }, []);

  const setPaste = useCallback((text: string) => {
    dispatch({ type: "SET_PASTE", text });
  }, []);

  const parseAndPreview = useCallback(
    async (config: AnyModeConfig, text?: string) => {
      const source = text ?? state.pasteText;
      const extracted = extractJson(source);
      if (!extracted.ok) {
        dispatch({ type: "PARSE_ERR", error: extracted.error });
        return;
      }
      try {
        const parsed = config.schema.parse(extracted.value);
        const preview = await config.resolvePreview(parsed);
        dispatch({ type: "PARSE_OK", value: parsed, preview });
      } catch (err) {
        if (err instanceof ZodError) {
          dispatch({ type: "PARSE_ERR", error: formatZodError(err) });
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        dispatch({ type: "PARSE_ERR", error: msg });
      }
    },
    [state.pasteText],
  );

  const patchPreview = useCallback(
    (patch: (prev: ResolvedPreview) => ResolvedPreview) => {
      dispatch({ type: "PREVIEW_PATCH", patch });
    },
    [],
  );

  const commit = useCallback(
    async (config: AnyModeConfig) => {
      if (!state.parsed || !state.preview) {
        dispatch({ type: "COMMIT_FAILED", error: "Nothing to commit" });
        return;
      }
      dispatch({
        type: "COMMIT_PHASE",
        state: { phase: "uploading", message: "Preparing commit…" },
      });
      try {
        const result = await config.commit({
          parsed: state.parsed,
          preview: state.preview,
          ctx: state.ctx,
          onPhaseChange: (s) => dispatch({ type: "COMMIT_PHASE", state: s }),
        });
        dispatch({ type: "COMMIT_DONE", result });
        opts.onSuccess?.(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dispatch({ type: "COMMIT_FAILED", error: msg });
      }
    },
    [opts, state.parsed, state.preview, state.ctx],
  );

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return useMemo(
    () => ({
      state,
      setMode,
      setContext,
      goTo,
      setPaste,
      parseAndPreview,
      patchPreview,
      commit,
      reset,
    }),
    [state, setMode, setContext, goTo, setPaste, parseAndPreview, patchPreview, commit, reset],
  );
}

function formatZodError(err: ZodError): string {
  const lines = err.issues.slice(0, 6).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `• ${path}: ${issue.message}`;
  });
  if (err.issues.length > 6) {
    lines.push(`… and ${err.issues.length - 6} more`);
  }
  return `The AI's response didn't match the expected shape:\n${lines.join("\n")}`;
}
