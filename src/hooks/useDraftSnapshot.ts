"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_EXPIRY_MS,
  draftStorageKey,
  entitiesMatch,
  readStoredDraft,
  removeStoredDraft,
  useDraftFlushOnLeave,
  writeStoredDraft,
  type DraftMetadata,
} from "./formDraftStorage";

/**
 * Draft persistence for forms whose state lives in many separate `useState`
 * calls (e.g. the Purchase Order and Material Request dialogs), where the
 * single-object `useFormDraft` can't be dropped in.
 *
 * The form assembles its user-entered values into one serializable `snapshot`
 * object and provides `applyDraft` to write a restored snapshot back through its
 * existing setters. Persistence (debounced + flush-on-leave), restore-on-open,
 * entity isolation, and expiry all behave exactly like `useFormDraft`.
 *
 * Best suited to *create* flows (the high-loss case). Pass `enabled: false` to
 * disable drafting (e.g. while editing an existing record where state hydrates
 * asynchronously from the server).
 */
export interface DraftSnapshotOptions<T extends object> {
  /** Unique key for this form (e.g., "po_dialog_create") */
  key: string;
  /** Whether the dialog/form is open */
  isOpen: boolean;
  /** The current user-entered values, assembled into one serializable object */
  snapshot: T;
  /** Repopulate the form's state from a restored draft (calls the form's setters) */
  applyDraft: (data: T) => void;
  /**
   * Explicit "has the user entered anything worth keeping?" signal. Strongly
   * preferred for forms that reset their state in an on-open effect (where the
   * generic snapshot-vs-open-baseline diff would race the reset). When omitted,
   * dirty is inferred by diffing the snapshot against its value at open.
   */
  dirty?: boolean;
  /** Optional reset used by "Start fresh" (clears the form's fields) */
  onDiscard?: () => void;
  /** Optional entity ID (edit mode) to keep drafts isolated per record */
  entityId?: string | null;
  /** Turn drafting on/off (default: true) */
  enabled?: boolean;
  /** Debounce delay in ms for saving (default: 600) */
  debounceMs?: number;
  /** How long a draft survives before it auto-expires (default: 24h) */
  expiryMs?: number;
  /** Called when a draft is restored */
  onRestore?: (data: T, metadata: DraftMetadata) => void;
}

export interface UseDraftSnapshotReturn {
  /** Whether a draft was restored when the dialog opened */
  hasRestoredDraft: boolean;
  /** Timestamp (ms) of the restored draft, if any */
  restoredAt: number | null;
  /** Clear the draft (call after a successful save) */
  clearDraft: () => void;
  /** Discard the draft + reset the form (wired to "Start fresh") */
  discardDraft: () => void;
}

export function useDraftSnapshot<T extends object>({
  key,
  isOpen,
  snapshot,
  applyDraft,
  dirty,
  onDiscard,
  entityId,
  enabled = true,
  debounceMs = 600,
  expiryMs = DEFAULT_EXPIRY_MS,
  onRestore,
}: DraftSnapshotOptions<T>): UseDraftSnapshotReturn {
  const storageKey = draftStorageKey(key);
  const snapshotJson = JSON.stringify(snapshot);

  const [isDirty, setIsDirty] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);

  const baselineRef = useRef<string | null>(null);
  const previousOpenRef = useRef(isOpen);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values via refs so the open/flush effects never go stale.
  const snapshotJsonRef = useRef(snapshotJson);
  snapshotJsonRef.current = snapshotJson;
  const applyDraftRef = useRef(applyDraft);
  const onRestoreRef = useRef(onRestore);
  const onDiscardRef = useRef(onDiscard);
  useEffect(() => {
    applyDraftRef.current = applyDraft;
    onRestoreRef.current = onRestore;
    onDiscardRef.current = onDiscard;
  });

  // Restore (or start clean) when the dialog opens.
  useEffect(() => {
    if (isOpen && !previousOpenRef.current) {
      // Baseline = the pristine values at open; "dirty" is any divergence from it.
      baselineRef.current = snapshotJsonRef.current;

      if (enabled) {
        const stored = readStoredDraft<T>(storageKey, expiryMs);
        if (stored && entitiesMatch(stored.metadata.entityId, entityId)) {
          applyDraftRef.current(stored.data);
          setHasRestoredDraft(true);
          setRestoredAt(stored.metadata.timestamp);
          setIsDirty(true);
          onRestoreRef.current?.(stored.data, stored.metadata);
        } else {
          if (stored) removeStoredDraft(storageKey);
          setHasRestoredDraft(false);
          setRestoredAt(null);
          setIsDirty(false);
        }
      }
    }
    if (!isOpen && previousOpenRef.current) {
      // Closed: keep the draft if dirty (recover later), drop it if untouched.
      if (!isDirty) removeStoredDraft(storageKey);
      baselineRef.current = null;
      setHasRestoredDraft(false);
      setRestoredAt(null);
    }
    previousOpenRef.current = isOpen;
  }, [isOpen, enabled, storageKey, entityId, expiryMs, isDirty]);

  // Recompute dirty whenever the snapshot changes while open. An explicit
  // `dirty` from the form wins; otherwise diff against the open-time baseline.
  useEffect(() => {
    if (!isOpen || !enabled) return;
    if (dirty !== undefined) {
      setIsDirty(dirty);
      return;
    }
    if (baselineRef.current === null) return;
    setIsDirty(snapshotJson !== baselineRef.current);
  }, [snapshotJson, isOpen, enabled, dirty]);

  // Debounced persistence.
  useEffect(() => {
    if (!isOpen || !enabled || !isDirty) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      writeStoredDraft(storageKey, snapshot, entityId);
    }, debounceMs);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isOpen, enabled, isDirty, snapshotJson, snapshot, storageKey, debounceMs, entityId]);

  // Flush the freshest snapshot the instant the page is hidden/closed.
  useDraftFlushOnLeave(isOpen && enabled && isDirty, () => {
    writeStoredDraft(storageKey, JSON.parse(snapshotJsonRef.current), entityId);
  });

  const clearDraft = useCallback(() => {
    removeStoredDraft(storageKey);
    setIsDirty(false);
    setHasRestoredDraft(false);
    setRestoredAt(null);
    baselineRef.current = snapshotJsonRef.current;
  }, [storageKey]);

  const discardDraft = useCallback(() => {
    removeStoredDraft(storageKey);
    onDiscardRef.current?.();
    setIsDirty(false);
    setHasRestoredDraft(false);
    setRestoredAt(null);
    baselineRef.current = null;
  }, [storageKey]);

  return { hasRestoredDraft, restoredAt, clearDraft, discardDraft };
}
