"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useTheme,
  Alert,
  LinearProgress,
} from "@mui/material";
import {
  CameraAlt,
  CheckCircle,
  Close,
  CloudUpload,
  ContentPaste,
  FolderOpen,
  InsertDriveFile,
  PictureAsPdf,
  Image as ImageIcon,
  Upload,
  Visibility,
} from "@mui/icons-material";
import { SupabaseClient } from "@supabase/supabase-js";
import { ensureFreshSession } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/timeout";
import { useIsMobile } from "@/hooks/useIsMobile";

// Upload status type for better UX feedback
type UploadStatus =
  | "idle"
  | "compressing"
  | "preparing"
  | "uploading"
  | "retrying"
  | "success"
  | "error";

// Upload configuration constants
const UPLOAD_CONSTANTS = {
  // Global timeout safety net (5 minutes - accounts for slow connections)
  GLOBAL_TIMEOUT: 300000,

  // Dynamic per-attempt timeout: min 30s, +5s per 100KB
  MIN_ATTEMPT_TIMEOUT: 30000,
  TIMEOUT_PER_100KB: 5000,

  // No-progress watchdog: if onloadstart/onprogress doesn't fire within this
  // window after xhr.send(), the request is likely queued behind a dead socket
  // in the browser's per-host connection pool. Abort fast so the retry loop
  // can re-send on a fresh socket — beats waiting the full per-attempt timeout.
  NO_PROGRESS_WATCHDOG: 5000,

  // Retry configuration
  MAX_RETRIES: 2, // Total 3 attempts (1 initial + 2 retries)
  INITIAL_RETRY_DELAY: 1000, // 1s base delay
} as const;

// Calculate dynamic timeout based on file size
const getAttemptTimeout = (fileSizeBytes: number): number => {
  const sizeKB = fileSizeBytes / 1024;
  return Math.max(
    UPLOAD_CONSTANTS.MIN_ATTEMPT_TIMEOUT,
    Math.ceil(sizeKB / 100) * UPLOAD_CONSTANTS.TIMEOUT_PER_100KB
  );
};

export type FileType = "pdf" | "image" | "all";
export type UploadedFile = {
  name: string;
  size: number;
  url: string;
  type?: string;
};

export type FileUploaderProps = {
  /** Supabase client instance */
  supabase: SupabaseClient<any>;
  /** Storage bucket name */
  bucketName: string;
  /** Folder path prefix for uploaded files (e.g., "site-123") */
  folderPath?: string;
  /** File name prefix (e.g., "contract", "receipt") */
  fileNamePrefix?: string;
  /** Allowed file types */
  accept?: FileType;
  /** Custom accept string override (e.g., "image/png,image/jpeg,application/pdf") */
  acceptString?: string;
  /** Max file size in MB */
  maxSizeMB?: number;
  /** Label text shown above the uploader */
  label?: string;
  /** Helper text shown below the drop zone */
  helperText?: string;
  /** Whether to upload immediately on file selection */
  uploadOnSelect?: boolean;
  /** Currently uploaded file (controlled) */
  value?: UploadedFile | null;
  /** Callback when file is uploaded successfully */
  onUpload?: (file: UploadedFile) => void;
  /** Callback when file is removed */
  onRemove?: () => void;
  /** Callback for errors */
  onError?: (error: string) => void;
  /** Callback when file is selected (before upload if uploadOnSelect=false) */
  onFileSelect?: (file: File) => void;
  /** Whether the uploader is disabled */
  disabled?: boolean;
  /** Whether to show view button for uploaded files */
  showViewButton?: boolean;
  /** Custom view handler */
  onView?: (url: string) => void;
  /** Compact mode for smaller spaces */
  compact?: boolean;
  /** Enable image compression before upload (default: true for images) */
  compressImages?: boolean;
  /** Max compressed size in KB (default: 200KB) */
  maxCompressedSizeKB?: number;
  /** Max width for compressed images (default: 1280px) */
  maxImageWidth?: number;
  /** Max height for compressed images (default: 1280px) */
  maxImageHeight?: number;
};

const FILE_TYPE_CONFIG: Record<FileType, { accept: string; label: string }> = {
  pdf: {
    accept: "application/pdf",
    label: "PDF files only",
  },
  image: {
    accept: "image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif",
    label: "PNG, JPG, WEBP files",
  },
  all: {
    accept: "application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif",
    label: "PDF, PNG, JPG, WEBP files",
  },
};

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return "Unknown size";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${sizes[i]}`;
};

// Get MIME type from file extension (fallback for files with empty/incorrect MIME)
const getMimeFromExtension = (filename: string): string | null => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'pdf': 'application/pdf',
  };
  return mimeMap[ext || ''] || null;
};

// Get effective MIME type (with extension fallback)
const getEffectiveMimeType = (file: File): string => {
  if (file.type && file.type !== 'application/octet-stream') {
    return file.type;
  }
  return getMimeFromExtension(file.name) || file.type || '';
};

// Sanitize filename - remove special characters that can cause issues
const sanitizeFilename = (filename: string): string => {
  // Get extension
  const lastDot = filename.lastIndexOf(".");
  const name = lastDot > 0 ? filename.substring(0, lastDot) : filename;
  const ext = lastDot > 0 ? filename.substring(lastDot) : "";

  // Replace non-alphanumeric characters (except dash and underscore) with underscore
  const sanitized = name
    .replace(/[^a-zA-Z0-9\-_]/g, "_")
    .replace(/_+/g, "_") // Replace multiple underscores with single
    .substring(0, 50); // Limit length

  return sanitized + ext;
};

// Image compression utility using createObjectURL (fast, no base64 encoding)
const compressImage = (
  file: File,
  maxSizeKB: number = 200,
  maxWidth: number = 1280,
  maxHeight: number = 1280,
  onProgress?: (percent: number) => void,
): Promise<File> => {
  return new Promise((resolve) => {
    const reportProgress = (pct: number) => {
      try {
        onProgress?.(pct);
      } catch {
        // Ignore consumer callback errors so they can't stall compression
      }
    };

    const effectiveMime = getEffectiveMimeType(file);

    // Skip compression for non-image files
    if (!effectiveMime.startsWith("image/")) {
      resolve(file);
      return;
    }

    // Skip HEIC/HEIF - browser Canvas API can't process these (except Safari)
    if (effectiveMime === 'image/heic' || effectiveMime === 'image/heif') {
      console.log('[Compress] Skipping HEIC/HEIF - not supported in browser');
      resolve(file);
      return;
    }

    // Skip if already small enough
    if (file.size <= maxSizeKB * 1024) {
      resolve(file);
      return;
    }

    let resolved = false;
    const safeResolve = (result: File) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    // Global timeout - if compression takes more than 4s, skip and upload original.
    // Real images decode + encode in <1s; the longer wait is dead time when canvas
    // can't decode (e.g. HEIC mis-extensioned as .jpg, corrupt images).
    const timeout = setTimeout(() => {
      console.warn("[Compress] Timed out after 4s, uploading original file");
      safeResolve(file);
    }, 4000);

    // Use createObjectURL instead of readAsDataURL (instant, no base64 encoding overhead)
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      reportProgress(12);
      try {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
        width = Math.max(1, width);
        height = Math.max(1, height);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          clearTimeout(timeout);
          URL.revokeObjectURL(objectUrl);
          console.warn("[Compress] No canvas context, using original");
          safeResolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);
        reportProgress(25);

        // Output as JPEG for best compression (PNG only if input is PNG)
        const outputType = effectiveMime === "image/png" ? "image/png" : "image/jpeg";
        const sanitizedName = sanitizeFilename(file.name);

        // Try quality levels in a single pass: 0.6 → 0.4 → 0.2
        const tryQualities = [0.6, 0.4, 0.2];
        const attemptProgress = [35, 42, 48];
        let qualityIndex = 0;

        const tryCompress = () => {
          if (resolved) return;
          const quality = tryQualities[qualityIndex];

          canvas.toBlob(
            (blob) => {
              if (resolved) return;
              reportProgress(attemptProgress[qualityIndex]);

              if (!blob) {
                clearTimeout(timeout);
                console.warn("[Compress] toBlob failed, using original");
                safeResolve(file);
                return;
              }

              const compressedFile = new File([blob], sanitizedName, {
                type: outputType,
                lastModified: Date.now(),
              });

              console.log(
                `[Compress] quality=${quality}: ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)}`
              );

              // Accept if small enough or we've tried all qualities
              if (compressedFile.size <= maxSizeKB * 1024 || qualityIndex >= tryQualities.length - 1) {
                clearTimeout(timeout);
                safeResolve(compressedFile);
              } else {
                qualityIndex++;
                tryCompress();
              }
            },
            outputType,
            quality
          );
        };

        tryCompress();
      } catch (err) {
        clearTimeout(timeout);
        URL.revokeObjectURL(objectUrl);
        console.warn("[Compress] Error:", err);
        safeResolve(file);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      console.warn("[Compress] Image load failed, using original");
      safeResolve(file);
    };

    img.src = objectUrl;
  });
};

const getFileIcon = (fileType?: string) => {
  if (!fileType)
    return <InsertDriveFile sx={{ fontSize: 32, color: "action.active" }} />;
  if (fileType.includes("pdf"))
    return <PictureAsPdf sx={{ fontSize: 32, color: "error.main" }} />;
  if (fileType.includes("image"))
    return <ImageIcon sx={{ fontSize: 32, color: "info.main" }} />;
  return <InsertDriveFile sx={{ fontSize: 32, color: "action.active" }} />;
};

export default function FileUploader({
  supabase,
  bucketName,
  folderPath = "uploads",
  fileNamePrefix = "file",
  accept = "all",
  acceptString,
  maxSizeMB = 15,
  label,
  helperText,
  uploadOnSelect = true,
  value,
  onUpload,
  onRemove,
  onError,
  onFileSelect,
  disabled = false,
  showViewButton = true,
  onView,
  compact = false,
  compressImages = true,
  maxCompressedSizeKB = 200,
  maxImageWidth = 1280,
  maxImageHeight = 1280,
}: FileUploaderProps) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Store last uploaded file to display until parent updates value prop
  const [lastUploadedFile, setLastUploadedFile] = useState<UploadedFile | null>(null);

  // New state for improved upload UX
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [retryCount, setRetryCount] = useState(0);

  // Refs for abort handling and cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const globalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const isMountedRef = useRef(true);

  const acceptMime = acceptString || FILE_TYPE_CONFIG[accept].accept;
  const acceptLabel = FILE_TYPE_CONFIG[accept].label;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // Cleanup effect for unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
      if (globalTimeoutRef.current) {
        clearTimeout(globalTimeoutRef.current);
      }
    };
  }, []);

  // Cancel handler for user-initiated cancellation
  const handleCancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (globalTimeoutRef.current) {
      clearTimeout(globalTimeoutRef.current);
      globalTimeoutRef.current = null;
    }
    setUploading(false);
    setUploadProgress(0);
    setUploadStatus("idle");
    setRetryCount(0);
    setError("Upload cancelled");
    // Clear error after 3 seconds
    setTimeout(() => {
      if (isMountedRef.current) setError(null);
    }, 3000);
  }, []);

  // Helper function for status text
  const getStatusText = useCallback((status: UploadStatus, currentRetry: number): string => {
    switch (status) {
      case "compressing":
        return "Compressing image...";
      case "preparing":
        return "Preparing upload...";
      case "uploading":
        return "Uploading...";
      case "retrying":
        return `Retrying (${currentRetry}/${UPLOAD_CONSTANTS.MAX_RETRIES})...`;
      case "success":
        return "Upload complete!";
      case "error":
        return "Upload failed";
      default:
        return "Processing...";
    }
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Use effective MIME type (with extension fallback for WhatsApp downloads etc.)
      const effectiveMime = getEffectiveMimeType(file);
      const allowedTypes = acceptMime.split(",").map((t) => t.trim());

      if (
        !allowedTypes.some(
          (t) => effectiveMime === t || effectiveMime.startsWith(t.replace("*", ""))
        )
      ) {
        return `Invalid file type. Allowed: ${acceptLabel}`;
      }
      if (file.size > maxSizeBytes) {
        return `File too large. Max size: ${maxSizeMB}MB`;
      }
      return null;
    },
    [acceptMime, acceptLabel, maxSizeBytes, maxSizeMB]
  );

  // Direct XHR upload with real progress tracking
  const uploadViaXHR = useCallback(
    (
      filePath: string,
      fileToUpload: File,
      accessToken: string,
      onProgress: (percent: number) => void,
      timeoutMs: number
    ): Promise<{ path: string }> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        // Get Supabase URL from the client
        // @ts-expect-error - accessing internal supabaseUrl
        const supabaseUrl = supabase.supabaseUrl || supabase.storageUrl?.replace('/storage/v1', '');
        if (!supabaseUrl) {
          // Fallback: extract from environment
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
          if (!url) {
            reject(new Error("Cannot determine Supabase URL"));
            return;
          }
        }

        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const uploadUrl = `${baseUrl}/storage/v1/object/${bucketName}/${filePath}`;

        // Set up timeout
        xhr.timeout = timeoutMs;

        // No-progress watchdog state. Set when the connection produces ANY
        // signal of life (onloadstart or onprogress). If still false when the
        // watchdog timer fires, we abort so the retry loop can re-issue on a
        // fresh socket.
        let progressed = false;
        let watchdogTriggered = false;
        let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
        const clearWatchdog = () => {
          if (watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
          }
        };

        // onloadstart fires once when the request starts loading. For tiny
        // files this may be the only "we have a connection" signal we get
        // before onload (no intermediate progress event).
        xhr.upload.onloadstart = () => {
          progressed = true;
          clearWatchdog();
        };

        // Real progress tracking
        xhr.upload.onprogress = (event) => {
          progressed = true;
          clearWatchdog();
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };

        xhr.onload = () => {
          clearWatchdog();
          xhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              // response.Key includes bucket name prefix (e.g., "work-updates/product-photos/file.jpg")
              // Strip bucket prefix since getPublicUrl() already prepends it
              let responsePath = response.Key || filePath;
              const bucketPrefix = `${bucketName}/`;
              if (responsePath.startsWith(bucketPrefix)) {
                responsePath = responsePath.slice(bucketPrefix.length);
              }
              resolve({ path: responsePath });
            } catch {
              // If response parsing fails but status is OK, use the filePath
              resolve({ path: filePath });
            }
          } else {
            let errorMsg = `Upload failed (${xhr.status})`;
            try {
              const errResponse = JSON.parse(xhr.responseText);
              errorMsg = errResponse.message || errResponse.error || errorMsg;
            } catch {
              // ignore parse error
            }
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          clearWatchdog();
          xhrRef.current = null;
          reject(new Error("Network error during upload"));
        };

        xhr.ontimeout = () => {
          clearWatchdog();
          xhrRef.current = null;
          reject(new Error(`Upload timed out after ${Math.round(timeoutMs / 1000)}s`));
        };

        xhr.onabort = () => {
          clearWatchdog();
          xhrRef.current = null;
          // Distinguish watchdog-triggered abort (retryable, transient stall)
          // from user/global-timeout abort (terminal, propagates as cancel).
          // The retry loop's break-on-cancel check uses "cancelled"/"aborted"
          // keywords; "stalled" is not in that set so it stays retryable.
          if (watchdogTriggered) {
            reject(
              new Error(
                `Upload stalled — no progress within ${UPLOAD_CONSTANTS.NO_PROGRESS_WATCHDOG / 1000}s`
              )
            );
          } else {
            reject(new Error("Upload cancelled"));
          }
        };

        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("cache-control", "3600");
        // Let browser set Content-Type with boundary for FormData, or set it for raw file
        xhr.setRequestHeader("Content-Type", fileToUpload.type || "application/octet-stream");
        xhr.send(fileToUpload);

        // Arm the watchdog after send. If the request is queued behind a dead
        // socket in the browser's per-host pool, neither onloadstart nor
        // onprogress will fire — we abort and let the retry loop try again.
        watchdogTimer = setTimeout(() => {
          if (!progressed) {
            console.warn(
              `[FileUploader] No upload progress within ${UPLOAD_CONSTANTS.NO_PROGRESS_WATCHDOG}ms — aborting (likely poisoned connection pool)`
            );
            watchdogTriggered = true;
            try {
              xhr.abort();
            } catch {
              // ignore — onabort will handle the rejection
            }
          }
        }, UPLOAD_CONSTANTS.NO_PROGRESS_WATCHDOG);
      });
    },
    [supabase, bucketName]
  );

  // Upload with retry using XHR
  const uploadWithRetry = useCallback(
    async (
      filePath: string,
      fileToUpload: File,
      accessToken: string,
      onProgress: (percent: number) => void,
      maxRetries: number = UPLOAD_CONSTANTS.MAX_RETRIES
    ): Promise<{ data: { path: string } | null; error: Error | null }> => {
      let lastError: Error | null = null;
      let currentToken = accessToken;
      const timeoutMs = getAttemptTimeout(fileToUpload.size);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Check if cancelled
        if (abortControllerRef.current?.signal.aborted) {
          return { data: null, error: new Error("Upload cancelled") };
        }

        // Update retry status for UI (only on retries, not first attempt)
        if (attempt > 0) {
          if (isMountedRef.current) {
            setUploadStatus("retrying");
            setRetryCount(attempt);
          }
          const delay = UPLOAD_CONSTANTS.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
          console.log(`[FileUploader] Waiting ${delay}ms before retry ${attempt}`);
          await new Promise((resolve) => setTimeout(resolve, delay));

          // On retry, refresh the session token - network errors are often caused by expired tokens
          try {
            const { data: { session: freshSession } } = await supabase.auth.refreshSession();
            if (freshSession?.access_token) {
              currentToken = freshSession.access_token;
              console.log("[FileUploader] Refreshed auth token for retry");
            }
          } catch (refreshErr) {
            console.warn("[FileUploader] Token refresh on retry failed:", refreshErr);
          }
        }

        console.log(
          `[FileUploader] Upload attempt ${attempt + 1}/${maxRetries + 1} (timeout: ${Math.round(timeoutMs / 1000)}s, size: ${formatFileSize(fileToUpload.size)})`
        );

        try {
          const result = await uploadViaXHR(
            filePath,
            fileToUpload,
            currentToken,
            onProgress,
            timeoutMs
          );
          return { data: result, error: null };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(`[FileUploader] Attempt ${attempt + 1} failed:`, lastError.message);

          // Don't retry on explicit cancellation
          if (
            lastError.message.includes("cancelled") ||
            lastError.message.includes("aborted")
          ) {
            break;
          }
        }
      }

      return { data: null, error: lastError };
    },
    [uploadViaXHR, supabase]
  );

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedFile | null> => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        onError?.(validationError);
        return null;
      }

      // Initialize upload state
      setUploading(true);
      setUploadProgress(0);
      setUploadSuccess(false);
      setUploadStatus("idle");
      setRetryCount(0);
      setError(null);

      // Create abort controller for this upload
      abortControllerRef.current = new AbortController();

      // Local phase tracker — closure variable so the visibilitychange handler
      // always sees the latest phase without needing a ref.
      let currentPhase: UploadStatus = 'idle';
      const setPhase = (s: UploadStatus) => { currentPhase = s; setUploadStatus(s); };

      // Whether the abort was triggered by the app being backgrounded (vs user cancel).
      let backgroundedAbort = false;

      // Cleanup helper
      let removeVisibilityListener: (() => void) | null = null;
      const cleanup = () => {
        removeVisibilityListener?.();
        removeVisibilityListener = null;
        if (globalTimeoutRef.current) {
          clearTimeout(globalTimeoutRef.current);
          globalTimeoutRef.current = null;
        }
      };

      // Global timeout safety net (2 minutes)
      globalTimeoutRef.current = setTimeout(() => {
        console.warn("[FileUploader] Global timeout reached");
        if (xhrRef.current) {
          xhrRef.current.abort();
          xhrRef.current = null;
        }
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        if (isMountedRef.current) {
          cleanup();
          setUploading(false);
          setUploadProgress(0);
          setUploadStatus("error");
          setError("Upload timed out. Please check your internet connection and try again.");
        }
      }, UPLOAD_CONSTANTS.GLOBAL_TIMEOUT);

      try {
        // === PHASE 1: Image Compression (quick, runs locally) ===
        let fileToUpload = file;
        const effectiveMime = getEffectiveMimeType(file);

        if (compressImages && effectiveMime.startsWith("image/")) {
          setPhase("compressing");
          setUploadProgress(5);

          try {
            fileToUpload = await compressImage(
              file,
              maxCompressedSizeKB,
              maxImageWidth,
              maxImageHeight,
              (pct) => {
                if (isMountedRef.current) {
                  setUploadProgress(pct);
                }
              }
            );
            console.log(
              `[FileUploader] Image compressed: ${formatFileSize(file.size)} -> ${formatFileSize(fileToUpload.size)}`
            );
          } catch (compressionError) {
            console.warn("[FileUploader] Compression failed, uploading original:", compressionError);
          }
        }

        // Check if cancelled
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error("Upload cancelled");
        }

        // === PHASE 2: Get fresh auth token ===
        // Ensure token is valid before upload - expired tokens cause CORS/network errors
        // from Supabase Storage that appear as "Network error during upload".
        // Use a distinct "preparing" status so the UI doesn't keep saying
        // "Compressing image..." while the auth refresh is running.
        if (isMountedRef.current) {
          setPhase("preparing");
          setUploadProgress(50);
        }

        // Visibilitychange guard: if the user backgrounds the app during the
        // auth-token refresh, the browser throttles setTimeout so withTimeout
        // never fires and the upload hangs at 50% forever. Abort immediately
        // when the user returns to the app and we're still in "preparing".
        const onVisibilityChange = () => {
          if (
            document.visibilityState === 'visible' &&
            currentPhase === 'preparing' &&
            isMountedRef.current
          ) {
            backgroundedAbort = true;
            abortControllerRef.current?.abort();
          }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        removeVisibilityListener = () =>
          document.removeEventListener('visibilitychange', onVisibilityChange);

        try {
          await ensureFreshSession();
        } catch (sessionError) {
          console.warn("[FileUploader] ensureFreshSession failed, proceeding with cached session:", sessionError);
        }
        // getSession() can block while an in-flight token refresh (triggered by
        // proactiveRefreshIfNeeded on page load) completes through the Cloudflare
        // proxy. On slow Indian networks this refresh takes 10-20s, causing a
        // false "Upload timed out" when the previous 5s limit was too short.
        // ensureFreshSession() above has a 4s internal timeout, so the refresh
        // could have been running for up to 4s already — allow 25s total headroom
        // (4s elapsed + 21s here) to cover the worst-case proxy round-trip.
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          21000,
          "Session check timed out. Please check your connection and try again.",
        );
        const session = sessionResult.data.session;
        if (!session?.access_token) {
          throw new Error("Session expired. Please log in again.");
        }

        // === PHASE 3: Upload with real XHR progress ===
        setPhase("uploading");
        setUploadProgress(55);

        const ext = file.name.split(".").pop() || "file";
        const timestamp = Date.now();
        const fileName = `${fileNamePrefix}_${timestamp}.${ext}`;
        const filePath = `${folderPath}/${fileName}`;

        const { data, error: uploadError } = await uploadWithRetry(
          filePath,
          fileToUpload,
          session.access_token,
          (percent) => {
            // Map XHR progress (0-100) to our UI range (55-99)
            if (isMountedRef.current) {
              setUploadProgress(55 + (percent * 0.44));
            }
          }
        );

        // Check if cancelled
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error("Upload cancelled");
        }

        if (uploadError) {
          throw uploadError;
        }

        if (!data?.path) {
          throw new Error("Upload completed but no file path returned");
        }

        // === PHASE 4: Success ===
        cleanup();
        setUploadProgress(100);
        setUploadSuccess(true);
        setPhase("success");

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from(bucketName).getPublicUrl(data.path);

        const uploadedFile: UploadedFile = {
          name: file.name,
          size: fileToUpload.size,
          url: publicUrl,
          type: file.type,
        };

        // Store locally so we can display it immediately
        setLastUploadedFile(uploadedFile);
        onUpload?.(uploadedFile);
        setPendingFile(null);

        // Keep success state visible briefly before resetting
        setTimeout(() => {
          if (isMountedRef.current) {
            setUploadProgress(0);
            setUploadSuccess(false);
            setUploadStatus("idle");
            setRetryCount(0);
          }
        }, 1500);

        return uploadedFile;
      } catch (err: unknown) {
        cleanup();
        setUploadProgress(0);
        setPhase("error");
        setRetryCount(0);

        const error = err instanceof Error ? err : new Error(String(err));
        let errorMsg = error.message || "Upload failed";
        if (errorMsg.includes("timed out")) {
          errorMsg = "Upload timed out. Please check your connection and try again.";
        } else if (
          errorMsg.includes("cancelled") ||
          errorMsg.includes("aborted")
        ) {
          errorMsg = backgroundedAbort
            ? "Upload was interrupted when the app was backgrounded. Please try again."
            : "Upload cancelled";
        } else if (errorMsg.includes("Network error")) {
          errorMsg = "Network error during upload. Please check your internet connection and try again.";
        }

        setError(errorMsg);
        onError?.(errorMsg);
        return null;
      } finally {
        if (isMountedRef.current) {
          setUploading(false);
        }
        cleanup();
        abortControllerRef.current = null;
      }
    },
    [
      supabase,
      bucketName,
      folderPath,
      fileNamePrefix,
      validateFile,
      compressImages,
      maxCompressedSizeKB,
      maxImageWidth,
      maxImageHeight,
      onUpload,
      onError,
      uploadWithRetry,
    ]
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        onError?.(validationError);
        return;
      }

      setError(null);
      onFileSelect?.(file);

      if (uploadOnSelect) {
        await uploadFile(file);
      } else {
        setPendingFile(file);
      }
    },
    [validateFile, onError, onFileSelect, uploadOnSelect, uploadFile]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || uploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = "";
  };

  // Clipboard paste via button (works on both desktop and mobile)
  const handleClipboardButtonClick = useCallback(async () => {
    if (uploading || disabled) return;
    try {
      const items = await navigator.clipboard.read();
      const imageItem = items.find((item) =>
        item.types.some((t) => t.startsWith("image/"))
      );
      if (!imageItem) {
        setClipboardError("No image found in clipboard");
        setTimeout(() => { if (isMountedRef.current) setClipboardError(null); }, 3000);
        return;
      }
      const type = imageItem.types.find((t) => t.startsWith("image/"))!;
      const blob = await imageItem.getType(type);
      const ext = type.split("/")[1] ?? "png";
      const file = new File([blob], `clipboard.${ext}`, { type });
      await handleFileSelect(file);
    } catch {
      setClipboardError("Could not read clipboard. Try Ctrl+V / Cmd+V in the drop zone.");
      setTimeout(() => { if (isMountedRef.current) setClipboardError(null); }, 3000);
    }
  }, [uploading, disabled, handleFileSelect]);

  // Ctrl+V / Cmd+V paste directly on the drop zone (desktop convenience)
  const handlePasteOnDropZone = useCallback(
    (e: React.ClipboardEvent) => {
      if (uploading || disabled) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/")
      );
      if (file) handleFileSelect(file);
    },
    [uploading, disabled, handleFileSelect]
  );

  const handleRemove = () => {
    setPendingFile(null);
    setLastUploadedFile(null);
    setError(null);
    setUploadProgress(0);
    setUploadSuccess(false);
    onRemove?.();
  };

  const handleView = () => {
    const fileUrl = value?.url || lastUploadedFile?.url;
    if (fileUrl) {
      if (onView) {
        onView(fileUrl);
      } else {
        window.open(fileUrl, "_blank");
      }
    }
  };

  // Clear lastUploadedFile when value is set by parent
  useEffect(() => {
    if (value) {
      setLastUploadedFile(null);
    }
  }, [value]);

  const hasFile = !!value || !!pendingFile || !!lastUploadedFile;
  const displayFile =
    value ||
    lastUploadedFile ||
    (pendingFile
      ? {
        name: pendingFile.name,
        size: pendingFile.size,
        type: pendingFile.type,
      }
      : null);

  // Determine if the file is successfully uploaded (either value from parent or lastUploadedFile)
  const isUploaded = !!value || !!lastUploadedFile;

  return (
    <Box>
      {label && (
        <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
          {label}
        </Typography>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptMime}
        style={{ display: "none" }}
        onChange={handleInputChange}
        disabled={disabled}
      />

      {/* Camera capture — only used on mobile via the "Take photo" button */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleInputChange}
        disabled={disabled}
      />

      <Paper
        ref={dropZoneRef}
        elevation={0}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePasteOnDropZone}
        onClick={() =>
          !isMobile && !disabled && !uploading && !hasFile && fileInputRef.current?.click()
        }
        sx={{
          p: compact ? 2 : 3,
          border: "2px dashed",
          borderColor: error
            ? "error.main"
            : isDragging
              ? "primary.main"
              : hasFile
                ? "success.main"
                : "divider",
          borderRadius: 2,
          bgcolor: error
            ? alpha(theme.palette.error.main, 0.04)
            : isDragging
              ? alpha(theme.palette.primary.main, 0.08)
              : hasFile
                ? alpha(theme.palette.success.main, 0.05)
                : "background.default",
          cursor: disabled
            ? "not-allowed"
            : uploading
              ? "wait"
              : hasFile
                ? "default"
                : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            borderColor: disabled
              ? "divider"
              : hasFile
                ? "success.main"
                : "primary.main",
            bgcolor: disabled
              ? "background.default"
              : hasFile
                ? alpha(theme.palette.success.main, 0.08)
                : alpha(theme.palette.primary.main, 0.04),
          },
        }}
      >
        {uploading ? (
          // Uploading State
          <Box sx={{ textAlign: "center" }}>
            {uploadSuccess ? (
              // Upload completed successfully
              <>
                <CheckCircle
                  sx={{
                    fontSize: compact ? 36 : 48,
                    color: "success.main",
                    mb: 1,
                  }}
                />
                <Typography variant="body2" color="success.main" fontWeight={600}>
                  Upload Complete!
                </Typography>
              </>
            ) : (
              // Still uploading - show detailed status
              <>
                <Box sx={{ position: "relative", display: "inline-flex" }}>
                  <CircularProgress
                    size={compact ? 36 : 48}
                    variant="determinate"
                    value={uploadProgress}
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: "absolute",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography
                      variant="caption"
                      component="div"
                      color="text.secondary"
                      sx={{ fontSize: compact ? "0.55rem" : "0.65rem" }}
                    >
                      {`${Math.round(uploadProgress)}%`}
                    </Typography>
                  </Box>
                </Box>

                {/* Status message */}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1.5, mb: 0.5 }}
                >
                  {getStatusText(uploadStatus, retryCount)}
                </Typography>

                <LinearProgress
                  variant="determinate"
                  value={uploadProgress}
                  sx={{ mt: 1, maxWidth: 200, mx: "auto", borderRadius: 1 }}
                />

                {/* Cancel button */}
                <Button
                  size="small"
                  variant="text"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  startIcon={<Close sx={{ fontSize: 14 }} />}
                  sx={{
                    mt: 1.5,
                    fontSize: "0.75rem",
                    color: "text.secondary",
                    "&:hover": { color: "error.main" },
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </Box>
        ) : hasFile && displayFile ? (
          // File Selected/Uploaded State
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: isUploaded
                  ? alpha(theme.palette.success.main, 0.1)
                  : alpha(theme.palette.primary.main, 0.1),
                display: "flex",
              }}
            >
              {getFileIcon(displayFile.type)}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                fontWeight={600}
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={displayFile.name}
              >
                {displayFile.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatFileSize(displayFile.size)}
              </Typography>
              {isUploaded && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    mt: 0.5,
                  }}
                >
                  <CheckCircle sx={{ fontSize: 14, color: "success.main" }} />
                  <Typography variant="caption" color="success.main">
                    Uploaded successfully
                  </Typography>
                </Box>
              )}
              {pendingFile && !isUploaded && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    mt: 0.5,
                  }}
                >
                  <Typography variant="caption" color="info.main">
                    Ready to upload
                  </Typography>
                </Box>
              )}
            </Box>
            <Stack direction="row" spacing={0.5}>
              {showViewButton && isUploaded && (value?.url || lastUploadedFile?.url) && (
                <Tooltip title="View File">
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleView();
                    }}
                  >
                    <Visibility fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Change File">
                <IconButton
                  size="small"
                  color="default"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={disabled}
                >
                  <Upload fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove();
                  }}
                  disabled={disabled}
                >
                  <Close fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        ) : isMobile ? (
          // Mobile Empty State — three tap-friendly action buttons
          <Stack spacing={1.5} sx={{ py: 1 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<CameraAlt />}
              onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
              disabled={disabled}
              sx={{ justifyContent: "flex-start", pl: 2 }}
            >
              Take photo
            </Button>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<ContentPaste />}
              onClick={(e) => { e.stopPropagation(); handleClipboardButtonClick(); }}
              disabled={disabled}
              sx={{ justifyContent: "flex-start", pl: 2 }}
            >
              Paste from clipboard
            </Button>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<FolderOpen />}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              disabled={disabled}
              sx={{ justifyContent: "flex-start", pl: 2 }}
            >
              Browse files
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
              {helperText || `${acceptLabel} • Max ${maxSizeMB}MB`}
            </Typography>
          </Stack>
        ) : (
          // Desktop Empty State — drag-and-drop zone
          <Box sx={{ textAlign: "center" }}>
            <CloudUpload
              sx={{
                fontSize: compact ? 36 : 48,
                color: isDragging ? "primary.main" : "action.disabled",
                mb: 1,
              }}
            />
            <Typography variant="body2" fontWeight={500} gutterBottom>
              {isDragging
                ? "Drop your file here"
                : "Drag and drop your file here"}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
            >
              or{" "}
              <Button
                size="small"
                variant="text"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={disabled}
                sx={{ textTransform: "none", p: 0, minWidth: "auto" }}
              >
                browse files
              </Button>
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, display: "block" }}
            >
              {helperText || `${acceptLabel} • Max ${maxSizeMB}MB`}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Desktop: clipboard paste button below drop zone (only when idle, no file) */}
      {!isMobile && !uploading && !hasFile && (
        <Button
          size="small"
          variant="text"
          startIcon={<ContentPaste fontSize="small" />}
          onClick={handleClipboardButtonClick}
          disabled={disabled}
          sx={{ mt: 1, color: "text.secondary", textTransform: "none" }}
        >
          Paste from clipboard (Ctrl+V)
        </Button>
      )}

      {clipboardError && (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
          {clipboardError}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Manual upload button when uploadOnSelect is false */}
      {!uploadOnSelect && pendingFile && !value && (
        <Button
          variant="contained"
          size="small"
          startIcon={<CloudUpload />}
          onClick={() => uploadFile(pendingFile)}
          disabled={uploading}
          sx={{ mt: 1 }}
        >
          {uploading ? "Uploading..." : "Upload Now"}
        </Button>
      )}
    </Box>
  );
}
