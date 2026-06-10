"use client";

/**
 * Per-row mini timeline for the Rental Hub. Five stages horizontally:
 * Request · Confirm · Active · Returned · Settled.
 *
 * State derivation only — visuals come from the shared {@link HubPipelineStepper}
 * ("Material rail"), the same component the Material Hub uses.
 *
 * Overdue rule (spec lines 196-198): the current node + the just-passed rail
 * segment flip to danger red. Cancelled rule (spec line 199): all 5 nodes muted.
 *
 * `buildRentalPipeline` is the single source of truth for a thread's stage
 * states; the desktop rail and the mobile summary bar (RentalThreadRow) share it.
 */

import { hubTokens } from "@/lib/material-hub/tokens";
import {
  VISIBLE_STAGES,
  stageIndex,
  visibleStageForThread,
} from "@/lib/rental-hub/stageHelpers";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";
import HubPipelineStepper, {
  type HubStep,
  type HubStepState,
} from "@/components/common/HubPipelineStepper";

export interface RentalPipelineModel {
  steps: HubStep[];
  accent: string;
  softAccent: string;
  lineActiveColor?: string;
}

/** Derive the rental stage model (shared by desktop rail + mobile bar). */
export function buildRentalPipeline(thread: RentalThread): RentalPipelineModel {
  const stage = visibleStageForThread(thread);
  const cancelled = thread.isCancelled;
  const overdue = thread.isOverdue && !cancelled;
  const idx = stageIndex(stage);

  // Overdue: current node + just-passed segment = danger.
  const accent = overdue ? hubTokens.danger : hubTokens.primary;
  const softAccent = overdue ? hubTokens.dangerSoft : hubTokens.primarySoft;

  const steps: HubStep[] = VISIBLE_STAGES.map((s, i) => {
    const done = !cancelled && idx >= 0 && i <= idx;
    const current = !cancelled && s.key === stage;
    // SETTLED is terminal — flip to green DONE (mirrors Materials' exhausted→DONE).
    const completedSuccess =
      !cancelled && s.key === "settled" && stage === "settled";
    const label = completedSuccess ? "DONE" : s.label;
    const dotCurrent = completedSuccess ? false : current;
    const state: HubStepState = cancelled
      ? "muted"
      : completedSuccess
        ? "success"
        : dotCurrent
          ? "current"
          : done
            ? "done"
            : "upcoming";
    return { key: s.key, label, state };
  });

  return {
    steps,
    accent,
    softAccent,
    lineActiveColor: overdue ? hubTokens.danger : undefined,
  };
}

export interface RentalThreadPipelineProps {
  thread: RentalThread;
}

export default function RentalThreadPipeline({ thread }: RentalThreadPipelineProps) {
  const model = buildRentalPipeline(thread);
  return (
    <HubPipelineStepper
      steps={model.steps}
      accent={model.accent}
      softAccent={model.softAccent}
      lineActiveColor={model.lineActiveColor}
    />
  );
}
