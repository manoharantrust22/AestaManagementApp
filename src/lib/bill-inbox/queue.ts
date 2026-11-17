"use client";

/**
 * Offline-first upload queue for the Bill Inbox.
 *
 * A captured photo is written to IndexedDB first (instant, works with no
 * signal), then uploaded in the background: original file + compressed
 * preview to the purchase-documents bucket, then a purchase_documents row,
 * then a request to read it. Any failure leaves the photo in the queue and it
 * is retried later (on reconnect, on the next app open, or by tapping retry).
 *
 * Uses its own IndexedDB database so clearing the React Query cache
 * (src/lib/cache/persistor.ts) never deletes unsent bills.
 */

import { createStore, del, entries, set } from "idb-keyval";
import imageCompression from "browser-image-compression";

import { createClient } from "@/lib/supabase/client";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";
import type { QueuedBill } from "@/types/bill-inbox.types";

export const BILL_BUCKET = "purchase-documents";
/** Matches the bucket limit set in 20261114100000_purchase_documents.sql. */
export const MAX_BILL_BYTES = 30 * 1024 * 1024;
export const ACCEPTED_BILL_TYPES = "image/*,application/pdf";

let store: ReturnType<typeof createStore> | null = null;
function queueStore() {
  if (!store) store = createStore("aesta-bill-inbox", "queue");
  return store;
}

// ---------------------------------------------------------------- listeners
type Listener = (items: QueuedBill[]) => void;
const listeners = new Set<Listener>();

export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  void listQueue().then(fn);
  return () => listeners.delete(fn);
}

async function notify() {
  const items = await listQueue();
  listeners.forEach((fn) => fn(items));
}

type UploadedListener = (documentId: string) => void;
const uploadedListeners = new Set<UploadedListener>();
/** Fires after a queued bill becomes a purchase_documents row. */
export function onBillUploaded(fn: UploadedListener): () => void {
  uploadedListeners.add(fn);
  return () => uploadedListeners.delete(fn);
}

// ---------------------------------------------------------------- storage
export async function listQueue(): Promise<QueuedBill[]> {
  try {
    const all = await entries<string, QueuedBill>(queueStore());
    return all.map(([, v]) => v).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  } catch (err) {
    console.warn("[bill-inbox] queue read failed", err);
    return [];
  }
}

async function putItem(item: QueuedBill) {
  await set(item.localId, item, queueStore());
}

export async function removeQueued(localId: string) {
  await del(localId, queueStore());
  await notify();
}

/** Save captured files to the phone. Never throws for one bad file; returns what was refused. */
export async function enqueueBills(files: File[], siteId: string | null): Promise<{ queued: number; refused: string[] }> {
  const refused: string[] = [];
  let queued = 0;
  for (const file of files) {
    if (file.size === 0) {
      refused.push(`${file.name}: empty file`);
      continue;
    }
    if (file.size > MAX_BILL_BYTES) {
      refused.push(`${file.name}: larger than 30 MB`);
      continue;
    }
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      refused.push(`${file.name}: not a photo or PDF`);
      continue;
    }
    const item: QueuedBill = {
      localId: crypto.randomUUID(),
      siteId,
      file,
      fileName: file.name || "bill.jpg",
      mimeType: file.type || "image/jpeg",
      size: file.size,
      capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
      attempts: 0,
      lastError: null,
      state: "waiting",
    };
    try {
      await putItem(item);
      queued++;
    } catch (err) {
      refused.push(`${file.name}: could not save on this phone (${(err as Error).message})`);
    }
  }
  await notify();
  if (queued > 0) void drainQueue();
  return { queued, refused };
}

// ---------------------------------------------------------------- processing
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compressed copy for the inbox list and the reader. Long side 2200px keeps small print legible. */
async function makePreview(item: QueuedBill): Promise<Blob | null> {
  if (!item.mimeType.startsWith("image/")) return null;
  try {
    const file = item.file instanceof File ? item.file : new File([item.file], item.fileName, { type: item.mimeType });
    return await imageCompression(file, {
      maxWidthOrHeight: 2200,
      maxSizeMB: 1.5,
      initialQuality: 0.82,
      fileType: "image/jpeg",
      useWebWorker: true,
    });
  } catch (err) {
    // HEIC on some browsers cannot be decoded; the original still uploads.
    console.warn("[bill-inbox] preview failed, uploading original only", err);
    return null;
  }
}

function extensionFor(item: QueuedBill): string {
  const fromName = item.fileName.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (item.mimeType === "application/pdf") return "pdf";
  return item.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
}

const isAlreadyThere = (err: unknown) => /already exists|duplicate/i.test((err as Error)?.message ?? "");

async function uploadOnce(path: string, blob: Blob, contentType: string) {
  try {
    await hardenedUpload({ supabase: createClient(), bucketName: BILL_BUCKET, filePath: path, file: blob, contentType });
  } catch (err) {
    // Same content-addressed path from an earlier partial attempt: fine.
    if (!isAlreadyThere(err)) throw err;
  }
}

async function processItem(item: QueuedBill, userId: string): Promise<void> {
  const supabase = createClient();
  const sha = await sha256Hex(item.file);
  const folder = `bill-inbox/${item.siteId ?? "no-site"}`;
  const originalPath = `${folder}/${sha}.${extensionFor(item)}`;
  const preview = await makePreview(item);
  const previewPath = preview ? `${folder}/${sha}.preview.jpg` : null;

  await uploadOnce(originalPath, item.file, item.mimeType);
  if (preview && previewPath) await uploadOnce(previewPath, preview, "image/jpeg");

  const { data, error } = await supabase
    .from("purchase_documents")
    .insert({
      site_id: item.siteId,
      storage_bucket: BILL_BUCKET,
      storage_path: originalPath,
      preview_path: previewPath,
      file_sha256: sha,
      mime_type: item.mimeType,
      size_bytes: item.size,
      original_filename: item.fileName,
      captured_at: item.capturedAt,
      uploaded_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Exact same file is already in the inbox: nothing to do.
      return;
    }
    throw new Error(error.message);
  }
  uploadedListeners.forEach((fn) => fn(data.id));
  void requestRead(data.id);
}

/** Ask the server to read a bill. Fire-and-forget; failure is recorded on the row. */
export async function requestRead(documentId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/bill-inbox/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body?.error ?? `Read failed (${res.status})` };
    }
    uploadedListeners.forEach((fn) => fn(documentId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

let draining: Promise<void> | null = null;
let currentUserId: string | null = null;

/** Set by the queue runner once the user profile is known. */
export function setQueueUser(userId: string | null) {
  currentUserId = userId;
}

/** Upload everything waiting, one at a time. Safe to call often; only one run at a time. */
export function drainQueue(): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    try {
      if (!currentUserId) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      for (const item of await listQueue()) {
        await putItem({ ...item, state: "uploading" });
        await notify();
        try {
          await processItem(item, currentUserId);
          await del(item.localId, queueStore());
        } catch (err) {
          await putItem({
            ...item,
            state: "failed",
            attempts: item.attempts + 1,
            lastError: (err as Error).message ?? "Upload failed",
          });
        }
        await notify();
      }
    } finally {
      draining = null;
    }
  })();
  return draining;
}
