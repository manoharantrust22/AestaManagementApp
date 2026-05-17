"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import {
  Snackbar,
  Alert,
  AlertColor,
  Slide,
  SlideProps,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  alpha,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

/**
 * Toast variants.
 * - "progress" is persistent (no auto-dismiss) until update() or dismiss().
 *   Use it for long-running operations: saving, syncing, uploading.
 * - "success" and "error" auto-dismiss unless an action button is present.
 */
type ToastVariant = AlertColor | "progress";

export interface ToastMessage {
  id: string;
  message: string;
  severity: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastHandle {
  id: string;
  update: (next: Partial<Omit<ToastMessage, "id">>) => void;
  dismiss: () => void;
}

interface ToastContextType {
  showToast: (
    message: string,
    severity?: AlertColor,
    duration?: number,
  ) => void;
  showSuccess: (message: string, duration?: number) => void;
  /**
   * Display an error toast. Second arg is either a legacy duration in ms
   * (kept for backward compatibility with older call sites) or an options
   * object that supports an action button (Retry) and explicit duration.
   * Errors WITH an action stay until dismissed; without, default 6000ms.
   */
  showError: (
    message: string,
    options?:
      | number
      | { duration?: number; action?: ToastMessage["action"] },
  ) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  /**
   * Display a persistent "Saving..." style toast and return a handle so the
   * caller can morph it into a success/error and dismiss it. Pairs with
   * inline button states for redundant feedback.
   */
  showProgress: (message: string) => ToastHandle;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function SlideUpTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

// Material 3 emphasized easing — same curve used for the SaveButton state morph
// so the two pieces of feedback feel like one motion system, not two systems
// glued together.
const M3_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const idCounterRef = useRef(0);

  const nextId = useCallback(() => {
    idCounterRef.current += 1;
    return `toast-${Date.now()}-${idCounterRef.current}`;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      severity: AlertColor = "info",
      duration: number = 4000,
    ) => {
      const id = nextId();
      setToasts((prev) => [...prev, { id, message, severity, duration }]);
    },
    [nextId],
  );

  const showSuccess = useCallback(
    (message: string, duration: number = 3000) => {
      showToast(message, "success", duration);
    },
    [showToast],
  );

  const showError = useCallback(
    (
      message: string,
      options:
        | number
        | { duration?: number; action?: ToastMessage["action"] } = {},
    ) => {
      // Normalize legacy `showError(msg, 8000)` form into the options shape.
      const opts =
        typeof options === "number" ? { duration: options } : options;
      const id = nextId();
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          severity: "error",
          // Errors with an action stay until the user acts; otherwise auto-dismiss.
          duration: opts.action ? undefined : opts.duration ?? 6000,
          action: opts.action,
        },
      ]);
    },
    [nextId],
  );

  const showWarning = useCallback(
    (message: string, duration: number = 5000) => {
      showToast(message, "warning", duration);
    },
    [showToast],
  );

  const showInfo = useCallback(
    (message: string, duration: number = 4000) => {
      showToast(message, "info", duration);
    },
    [showToast],
  );

  const showProgress = useCallback(
    (message: string): ToastHandle => {
      const id = nextId();
      setToasts((prev) => [
        ...prev,
        { id, message, severity: "progress" }, // no duration -> persistent
      ]);
      return {
        id,
        update: (next) => {
          setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, ...next } : t)),
          );
          // If the update gave it a finite duration, schedule dismissal.
          if (next.duration && next.duration > 0) {
            window.setTimeout(() => dismiss(id), next.duration);
          }
        },
        dismiss: () => dismiss(id),
      };
    },
    [dismiss, nextId],
  );

  const currentToast = toasts[0];

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        showProgress,
      }}
    >
      {children}

      <Snackbar
        // Persistent toasts (progress / error-with-action) skip auto-dismiss.
        open={!!currentToast}
        autoHideDuration={currentToast?.duration ?? null}
        onClose={(_event, reason) => {
          if (reason === "clickaway") return; // Don't dismiss on outside click
          if (currentToast) dismiss(currentToast.id);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        TransitionComponent={SlideUpTransition}
        // Account for mobile bottom nav. On desktop the snackbar sits clear of
        // any sticky footer.
        sx={{ mb: { xs: 7, sm: 2 } }}
      >
        {currentToast ? (
          <ToastSurface toast={currentToast} onDismiss={() => dismiss(currentToast.id)} />
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

/**
 * Material 3 styled toast surface. Three visual treatments:
 *   - progress: filled neutral (low contrast), spinner + indeterminate bar
 *   - success: filled green, check icon
 *   - error: filled red, error icon, optional retry button
 * Other AlertColor variants fall back to MUI's filled Alert.
 */
function ToastSurface({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  const isProgress = toast.severity === "progress";
  const isSuccess = toast.severity === "success";
  const isError = toast.severity === "error";

  if (isProgress) {
    return (
      <Box
        role="status"
        aria-live="polite"
        sx={(theme) => ({
          minWidth: 320,
          maxWidth: 480,
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: theme.palette.mode === "dark" ? "#2A2D31" : "#1F2024",
          color: "#fff",
          boxShadow:
            "0 6px 12px -4px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.10)",
          animation: `toast-in 220ms ${M3_EASING} both`,
          "@keyframes toast-in": {
            from: { transform: "translateY(8px)", opacity: 0 },
            to: { transform: "translateY(0)", opacity: 1 },
          },
        })}
      >
        <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1.25, gap: 1.5 }}>
          <CircularProgress
            size={18}
            thickness={5}
            sx={{ color: "rgba(255,255,255,0.85)" }}
          />
          <Box sx={{ fontSize: "0.9rem", lineHeight: 1.35, flex: 1 }}>
            {toast.message}
          </Box>
        </Box>
        <LinearProgress
          sx={{
            height: 2,
            bgcolor: "rgba(255,255,255,0.12)",
            "& .MuiLinearProgress-bar": { bgcolor: "rgba(255,255,255,0.85)" },
          }}
        />
      </Box>
    );
  }

  if (isSuccess) {
    return (
      <Box
        role="status"
        aria-live="polite"
        onClick={onDismiss}
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          minWidth: 280,
          maxWidth: 480,
          px: 2,
          py: 1.25,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.success.main, 0.95),
          color: theme.palette.success.contrastText,
          boxShadow:
            "0 6px 12px -4px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.10)",
          cursor: "pointer",
          animation: `toast-in-success 240ms ${M3_EASING} both`,
          "@keyframes toast-in-success": {
            from: { transform: "translateY(8px) scale(0.97)", opacity: 0 },
            to: { transform: "translateY(0) scale(1)", opacity: 1 },
          },
        })}
      >
        <CheckCircleRoundedIcon sx={{ fontSize: 20 }} />
        <Box sx={{ fontSize: "0.9rem", lineHeight: 1.35, flex: 1 }}>
          {toast.message}
        </Box>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box
        role="alert"
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          minWidth: 320,
          maxWidth: 520,
          px: 2,
          py: 1.25,
          borderRadius: 2,
          bgcolor: theme.palette.error.dark,
          color: theme.palette.error.contrastText,
          boxShadow:
            "0 6px 12px -4px rgba(0,0,0,0.22), 0 2px 4px rgba(0,0,0,0.12)",
          animation: `toast-in 220ms ${M3_EASING} both`,
        })}
      >
        <ErrorRoundedIcon sx={{ fontSize: 20, flexShrink: 0 }} />
        <Box sx={{ fontSize: "0.9rem", lineHeight: 1.35, flex: 1 }}>
          {toast.message}
        </Box>
        {toast.action ? (
          <Button
            size="small"
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            startIcon={<RefreshRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{
              color: "#fff",
              textTransform: "none",
              fontWeight: 600,
              minWidth: "auto",
              px: 1.25,
              "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
            }}
          >
            {toast.action.label}
          </Button>
        ) : (
          <Button
            size="small"
            onClick={onDismiss}
            sx={{
              color: "rgba(255,255,255,0.85)",
              textTransform: "none",
              minWidth: "auto",
              px: 1,
              "&:hover": { bgcolor: "rgba(255,255,255,0.10)" },
            }}
          >
            Dismiss
          </Button>
        )}
      </Box>
    );
  }

  // Fallback for info / warning — MUI filled Alert keeps existing look.
  return (
    <Alert
      onClose={onDismiss}
      severity={toast.severity as AlertColor}
      variant="filled"
      sx={{
        width: "100%",
        minWidth: 300,
        boxShadow: 3,
        "& .MuiAlert-message": { fontSize: "0.95rem" },
      }}
    >
      {toast.message}
    </Alert>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
