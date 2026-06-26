"use client";

import { useEffect, useRef } from "react";

/**
 * Shared, durable storage core for form drafts.
 *
 * Drafts live in `localStorage` (not sessionStorage) so entered data survives a
 * refresh, a tab close, a browser crash, and the user closing a frozen
 * "no network" tab. Each draft carries a timestamp + entityId so it can expire
 * and so an edit draft for one record never bleeds into another.
 *
 * Both `useFormDraft` (single form-data object) and `useDraftSnapshot`
 * (scattered useState forms) build on these helpers, so behavior stays
 * identical across the app.
 */

export const STORAGE_PREFIX = "form_draft_";
/** Default lifetime of a draft. 24h so all-day forms (attendance, multi-item POs) don't expire mid-use. */
export const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface DraftMetadata {
  timestamp: number;
  entityId?: string | null;
}

export interface StoredDraft<T> {
  data: T;
  metadata: DraftMetadata;
}

export function draftStorageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

/** Read a draft by its already-prefixed storage key, dropping it if older than `expiryMs`. */
export function readStoredDraft<T>(
  storageKey: string,
  expiryMs: number = DEFAULT_EXPIRY_MS
): StoredDraft<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const item = localStorage.getItem(storageKey);
    if (!item) return null;
    const parsed = JSON.parse(item) as StoredDraft<T>;

    if (Date.now() - parsed.metadata.timestamp > expiryMs) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredDraft<T>(
  storageKey: string,
  data: T,
  entityId?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredDraft<T> = {
      data,
      metadata: { timestamp: Date.now(), entityId },
    };
    localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch {
    // Ignore storage errors (quota exceeded, private mode, etc.)
  }
}

export function removeStoredDraft(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore errors
  }
}

/** True when an unexpired draft for `entityId` exists. Lets a page show a
 *  "Resume draft" affordance WITHOUT mounting the form. */
export function hasStoredDraft(
  key: string,
  entityId?: string | null,
  expiryMs: number = DEFAULT_EXPIRY_MS
): boolean {
  const draft = readStoredDraft(draftStorageKey(key), expiryMs);
  if (!draft) return false;
  if (entityId === undefined) return true;
  return entitiesMatch(draft.metadata.entityId, entityId);
}

/** A stored draft matches the current form if both target the same record.
 *  `null` and `undefined` are both treated as "new / no entity", so a draft
 *  saved without an entityId still matches a form (or a Resume button) that
 *  passes `null`. */
export function entitiesMatch(
  draftEntityId: string | null | undefined,
  entityId: string | null | undefined
): boolean {
  return (draftEntityId ?? null) === (entityId ?? null);
}

/**
 * Persist the latest draft the instant the page is being hidden/closed, instead
 * of waiting for the debounce timer. This is the real fix for mobile app-switch
 * and refresh loss — `beforeunload` alone is unreliable on mobile, but
 * `visibilitychange`→hidden and `pagehide` fire reliably.
 *
 * `persist` is read through a ref so the listeners always flush the freshest
 * data without re-subscribing on every keystroke.
 */
export function useDraftFlushOnLeave(enabled: boolean, persist: () => void): void {
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const flush = () => persistRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}
