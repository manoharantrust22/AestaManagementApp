"use client";

import { useEffect, useCallback, useRef, useState } from "react";
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

export type { DraftMetadata };

export interface FormDraftOptions<T> {
  /** Unique key for this form (e.g., "vendor_dialog", "material_dialog") */
  key: string;
  /** Initial form data (used when no draft exists or when resetting) */
  initialData: T;
  /** Whether the dialog/form is open */
  isOpen: boolean;
  /** Optional entity ID for edit mode (to differentiate drafts for different entities) */
  entityId?: string | null;
  /** Debounce delay in ms for saving (default: 500) */
  debounceMs?: number;
  /** How long a draft survives before it auto-expires (default: 24h) */
  expiryMs?: number;
  /** Called when draft is restored */
  onRestore?: (data: T, metadata: DraftMetadata) => void;
}

export interface UseFormDraftReturn<T> {
  /** Current form data */
  formData: T;
  /** Update the entire form data object */
  setFormData: React.Dispatch<React.SetStateAction<T>>;
  /** Update a single field */
  updateField: <K extends keyof T>(field: K, value: T[K]) => void;
  /** Update multiple fields at once */
  updateFormData: (updates: Partial<T>) => void;
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether a draft was restored when the dialog opened */
  hasRestoredDraft: boolean;
  /** Timestamp (ms) of the restored draft, if any — for "restored from {time}" UI */
  restoredAt: number | null;
  /** Clear the draft (call after successful save) */
  clearDraft: () => void;
  /** Discard draft and reset to initial data */
  discardDraft: () => void;
  /** Mark as clean without clearing storage (for partial saves) */
  markClean: () => void;
}

export function useFormDraft<T extends object>({
  key,
  initialData,
  isOpen,
  entityId,
  debounceMs = 500,
  expiryMs = DEFAULT_EXPIRY_MS,
  onRestore,
}: FormDraftOptions<T>): UseFormDraftReturn<T> {
  const storageKey = draftStorageKey(key);
  const [formData, setFormData] = useState<T>(initialData);
  const [isDirty, setIsDirty] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousOpenRef = useRef(isOpen);
  const previousEntityIdRef = useRef(entityId);
  const initialDataRef = useRef(initialData);

  // Keep initialData ref updated
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  // Store onRestore callback in ref to avoid dependency issues
  const onRestoreRef = useRef(onRestore);
  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  // Restore draft when dialog opens
  // Note: Using refs for initialData and onRestore to avoid infinite loops
  // when parent component doesn't memoize these values
  useEffect(() => {
    if (isOpen && !previousOpenRef.current) {
      // Dialog just opened
      const storedDraft = readStoredDraft<T>(storageKey, expiryMs);

      if (storedDraft && entitiesMatch(storedDraft.metadata.entityId, entityId)) {
        setFormData(storedDraft.data);
        setIsDirty(true);
        setHasRestoredDraft(true);
        setRestoredAt(storedDraft.metadata.timestamp);
        onRestoreRef.current?.(storedDraft.data, storedDraft.metadata);
      } else {
        // No draft, or a draft for a different entity — start clean.
        if (storedDraft) removeStoredDraft(storageKey);
        setFormData(initialDataRef.current);
        setIsDirty(false);
        setHasRestoredDraft(false);
        setRestoredAt(null);
      }
    }
    previousOpenRef.current = isOpen;
  }, [isOpen, storageKey, entityId, expiryMs]);

  // Reset form when entityId changes while dialog is open (switching from edit to new, etc.)
  useEffect(() => {
    if (isOpen && previousEntityIdRef.current !== entityId) {
      // Entity changed - reset form
      removeStoredDraft(storageKey);
      setFormData(initialDataRef.current);
      setIsDirty(false);
      setHasRestoredDraft(false);
      setRestoredAt(null);
    }
    previousEntityIdRef.current = entityId;
  }, [isOpen, entityId, storageKey]);

  // Debounced persistence
  useEffect(() => {
    if (!isOpen || !isDirty) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      writeStoredDraft(storageKey, formData, entityId);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOpen, isDirty, formData, storageKey, debounceMs, entityId]);

  // Flush the freshest data the instant the page is hidden/closed (app-switch,
  // refresh, tab close) — before the debounce timer would have fired.
  useDraftFlushOnLeave(isOpen && isDirty, () => {
    writeStoredDraft(storageKey, formData, entityId);
  });

  // Clear draft when dialog closes normally (without dirty state)
  useEffect(() => {
    if (previousOpenRef.current && !isOpen && !isDirty) {
      // Dialog closed and form is clean - clear draft
      removeStoredDraft(storageKey);
      setHasRestoredDraft(false);
      setRestoredAt(null);
    }
  }, [isOpen, isDirty, storageKey]);

  // Warn on page unload if dirty (secondary net; the flush above is the real save)
  useEffect(() => {
    if (!isOpen || !isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isOpen, isDirty]);

  // Update single field
  const updateField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setIsDirty(true);
    },
    []
  );

  // Bulk update
  const updateFormData = useCallback((updates: Partial<T>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  }, []);

  // Clear draft (call after successful save)
  const clearDraft = useCallback(() => {
    removeStoredDraft(storageKey);
    setIsDirty(false);
    setHasRestoredDraft(false);
    setRestoredAt(null);
  }, [storageKey]);

  // Discard draft and reset to initial
  const discardDraft = useCallback(() => {
    removeStoredDraft(storageKey);
    setFormData(initialDataRef.current);
    setIsDirty(false);
    setHasRestoredDraft(false);
    setRestoredAt(null);
  }, [storageKey]);

  // Mark as clean without clearing storage
  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  return {
    formData,
    setFormData,
    updateField,
    updateFormData,
    isDirty,
    hasRestoredDraft,
    restoredAt,
    clearDraft,
    discardDraft,
    markClean,
  };
}
