"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Collapse,
  Divider,
  Link,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Engineering,
  Email as EmailIcon,
  Lock as LockIcon,
  ErrorOutline,
  CheckCircleOutline,
  ExpandMore,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import OAuthButtons, { type OAuthProvider } from "@/components/auth/OAuthButtons";
import {
  LAST_LOGIN_METHOD_KEY,
  oauthErrorMessage,
  readLoginMethod,
  safeNextPath,
  type LoginMethod,
} from "@/lib/auth/redirect";

// Error messages mapping for user-friendly display
const ERROR_MESSAGES: Record<string, string> = {
  // Supabase Auth Errors
  "invalid login credentials":
    "Invalid email or password. Please check your credentials and try again.",
  "email not confirmed":
    "Please verify your email address before signing in. Check your inbox for the confirmation link.",
  "user not found":
    "No account found with this email address. Please check your email or contact your administrator.",
  "invalid email": "Please enter a valid email address.",
  "signup disabled":
    "New account registration is currently disabled. Please contact your administrator.",
  "email rate limit exceeded":
    "Too many login attempts. Please wait a few minutes and try again.",
  "too many requests":
    "Too many login attempts. Please wait a few minutes before trying again.",
  "network request failed":
    "Unable to connect to the server. Please check your internet connection.",
  "failed to fetch":
    "Unable to connect to the server. Please check your internet connection and try again.",
  "invalid password":
    "The password you entered is incorrect. Please try again.",
  "user already registered": "This email is already registered.",
};

// Local storage keys
const STORAGE_KEYS = {
  REMEMBERED_EMAIL: "aesta_remembered_email",
  REMEMBER_ME: "aesta_remember_me",
  LOGIN_ATTEMPTS: "aesta_login_attempts",
  LOCKOUT_UNTIL: "aesta_lockout_until",
};

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password minimum length
const MIN_PASSWORD_LENGTH = 6;

// Max login attempts before lockout
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

interface FormErrors {
  email?: string;
  password?: string;
}

export default function LoginPageWrapper() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}

function LoginPage() {
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // UI state
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutDisplay, setLockoutDisplay] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Last sign-in method on this device: shown first next time.
  const [lastMethod, setLastMethod] = useState<LoginMethod | null>(null);
  // Phones: the password form sits behind "Sign in with password".
  const [passwordOpen, setPasswordOpen] = useState(false);

  const { signIn, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("session_expired") === "true";
  const nextPath = safeNextPath(searchParams.get("next"));

  // OAuth errors come back in the query (from /auth/callback) or, for some
  // provider failures, in the hash. Show them in plain words, then tidy the URL.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const pick = (k: string) => searchParams.get(k) ?? hash.get(k);
    const message = oauthErrorMessage({
      error: pick("error"),
      code: pick("error_code"),
      description: pick("error_description"),
    });
    if (message) {
      setError(message);
      const clean = new URL(window.location.href);
      ["error", "error_code", "error_description"].forEach((k) => clean.searchParams.delete(k));
      clean.hash = "";
      window.history.replaceState(null, "", clean.pathname + clean.search);
    }
  }, [searchParams]);

  const startOAuth = async (provider: OAuthProvider) => {
    setError("");
    try {
      localStorage.setItem(LAST_LOGIN_METHOD_KEY, provider);
    } catch {
      // Private mode: ordering just won't be remembered.
    }
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth(
      provider === "azure"
        ? { provider: "azure", options: { scopes: "email", redirectTo } }
        : { provider: "google", options: { redirectTo } }
    );
    if (oauthError) {
      console.error("OAuth start failed:", oauthError);
      setError(
        oauthErrorMessage({ code: oauthError.code, description: oauthError.message }) ??
          "Could not start sign-in. Please try again."
      );
    }
  };

  // Clear expired session to stop background token refresh errors
  useEffect(() => {
    if (sessionExpired) {
      const supabase = createClient();
      // Use scope: 'local' to only clear localStorage without calling Supabase API
      // (which would also fail if the token is already expired/invalid)
      supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }
  }, [sessionExpired]);

  // Load remembered email and check lockout on mount
  useEffect(() => {
    const method = readLoginMethod(localStorage.getItem(LAST_LOGIN_METHOD_KEY));
    setLastMethod(method);
    if (method === "password") setPasswordOpen(true);

    // Load remembered email
    const remembered = localStorage.getItem(STORAGE_KEYS.REMEMBER_ME);
    if (remembered === "true") {
      const savedEmail = localStorage.getItem(STORAGE_KEYS.REMEMBERED_EMAIL);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
        setPasswordOpen(true);
      }
    }

    // Check for existing lockout
    const storedLockout = localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    if (storedLockout) {
      const lockoutTime = parseInt(storedLockout, 10);
      if (lockoutTime > Date.now()) {
        setLockoutUntil(lockoutTime);
        setPasswordOpen(true);
      } else {
        localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
        localStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
      }
    }

    // Load login attempts
    const storedAttempts = localStorage.getItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
    if (storedAttempts) {
      setLoginAttempts(parseInt(storedAttempts, 10));
    }
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.push(nextPath);
    }
  }, [user, authLoading, router, nextPath]);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutUntil || lockoutUntil <= Date.now()) {
      setLockoutDisplay("");
      return;
    }

    const updateDisplay = () => {
      const remaining = Math.max(0, lockoutUntil - Date.now());
      if (remaining <= 0) {
        setLockoutUntil(null);
        setLockoutDisplay("");
        setLoginAttempts(0);
        localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
        localStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setLockoutDisplay(`${minutes}:${seconds.toString().padStart(2, "0")}`);
      }
    };

    updateDisplay();
    const interval = setInterval(updateDisplay, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Validate email
  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) {
      return "Email is required";
    }
    if (!EMAIL_REGEX.test(value)) {
      return "Please enter a valid email address";
    }
    return undefined;
  };

  // Validate password
  const validatePassword = (value: string): string | undefined => {
    if (!value) {
      return "Password is required";
    }
    if (value.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    return undefined;
  };

  // Real-time validation on blur
  const handleBlur = (field: "email" | "password") => {
    setTouched((prev) => ({ ...prev, [field]: true }));

    if (field === "email") {
      setFormErrors((prev) => ({ ...prev, email: validateEmail(email) }));
    } else {
      setFormErrors((prev) => ({
        ...prev,
        password: validatePassword(password),
      }));
    }
  };

  // Clear field error on change
  const handleEmailChange = (value: string) => {
    setEmail(value);
    setError("");
    if (touched.email) {
      setFormErrors((prev) => ({ ...prev, email: validateEmail(value) }));
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setError("");
    if (touched.password) {
      setFormErrors((prev) => ({
        ...prev,
        password: validatePassword(value),
      }));
    }
  };

  // Get user-friendly error message
  const getErrorMessage = (err: any): string => {
    const errorMsg = (err?.message || err?.toString() || "").toLowerCase();

    // Check for known error patterns
    for (const [pattern, message] of Object.entries(ERROR_MESSAGES)) {
      if (errorMsg.includes(pattern)) {
        return message;
      }
    }

    // Check for network errors
    if (errorMsg.includes("fetch") || errorMsg.includes("network")) {
      return ERROR_MESSAGES["network request failed"];
    }

    // Default error
    return "An error occurred during sign in. Please try again.";
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check lockout
    if (lockoutUntil && lockoutUntil > Date.now()) {
      setError(
        `Too many failed attempts. Please try again in ${lockoutDisplay}`
      );
      return;
    }

    // Validate all fields
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    setFormErrors({ email: emailError, password: passwordError });
    setTouched({ email: true, password: true });

    if (emailError || passwordError) {
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await signIn(email.trim().toLowerCase(), password);

      // Success - handle remember me
      if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "true");
        localStorage.setItem(
          STORAGE_KEYS.REMEMBERED_EMAIL,
          email.trim().toLowerCase()
        );
      } else {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
        localStorage.removeItem(STORAGE_KEYS.REMEMBERED_EMAIL);
      }

      // Clear login attempts on success
      localStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
      localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
      localStorage.setItem(LAST_LOGIN_METHOD_KEY, "password");

      setSuccessMessage("Login successful! Redirecting...");

      // Small delay to show success message
      setTimeout(() => {
        router.push(nextPath);
      }, 500);
    } catch (err: any) {
      console.error("Login error:", err);

      // Increment login attempts
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);
      localStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, newAttempts.toString());

      // Check if should lockout
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        const lockoutTime = Date.now() + LOCKOUT_DURATION;
        setLockoutUntil(lockoutTime);
        localStorage.setItem(
          STORAGE_KEYS.LOCKOUT_UNTIL,
          lockoutTime.toString()
        );
        setError(
          "Too many failed attempts. Your account is temporarily locked. Please try again in 5 minutes."
        );
      } else {
        const remainingAttempts = MAX_LOGIN_ATTEMPTS - newAttempts;
        const errorMessage = getErrorMessage(err);
        setError(
          remainingAttempts <= 2
            ? `${errorMessage} (${remainingAttempts} attempt${
                remainingAttempts === 1 ? "" : "s"
              } remaining)`
            : errorMessage
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
        }}
      >
        <CircularProgress sx={{ color: "white" }} size={48} />
      </Box>
    );
  }

  const isLocked = !!(lockoutUntil && lockoutUntil > Date.now());

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "safe center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
        py: { xs: 1.5, sm: 1 },
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: 440 }}>
        <Card
          sx={{
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, sm: 3 }, "&:last-child": { pb: { xs: 1.5, sm: 1.5 } } }}>
            {/* Logo and Title */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Box
                sx={{
                  bgcolor: "primary.main",
                  borderRadius: "50%",
                  p: 1,
                  mb: 1,
                  boxShadow: "0 4px 14px rgba(25, 118, 210, 0.4)",
                }}
              >
                <Engineering sx={{ fontSize: 26, color: "white", display: "block" }} />
              </Box>
              <Typography
                variant="h5"
                component="h1"
                fontWeight={700}
                textAlign="center"
              >
                Aesta
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                Construction & Labor Management System
              </Typography>
            </Box>

            {/* Session Expired Message */}
            {sessionExpired && (
              <Alert
                severity="warning"
                sx={{ mb: 2 }}
              >
                Your session has expired. Please sign in again to continue.
              </Alert>
            )}

            {/* Success Message */}
            <Collapse in={!!successMessage}>
              <Alert
                severity="success"
                icon={<CheckCircleOutline />}
                sx={{ mb: 2 }}
              >
                {successMessage}
              </Alert>
            </Collapse>

            {/* Error Message */}
            <Collapse in={!!error}>
              <Alert
                severity="error"
                icon={<ErrorOutline />}
                sx={{ mb: 2 }}
                onClose={() => setError("")}
              >
                {error}
              </Alert>
            </Collapse>

            {/* Lockout Warning */}
            {isLocked && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Account temporarily locked. Try again in{" "}
                <strong>{lockoutDisplay}</strong>
              </Alert>
            )}

            {/* Microsoft / Google first; the last one used on this device on top */}
            <OAuthButtons
              order={lastMethod === "google" ? ["google", "azure"] : ["azure", "google"]}
              lastUsed={lastMethod}
              disabled={loading}
              onSelect={startOAuth}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ mt: 1, textAlign: "center" }}
            >
              Neram team: use Microsoft. Everyone else: use Google.
            </Typography>

            <Divider sx={{ my: 1.5, color: "text.secondary", fontSize: "0.875rem" }}>or</Divider>

            {/* Phones: password form behind a button (always shown from sm up) */}
            <Button
              fullWidth
              variant="text"
              endIcon={<ExpandMore />}
              aria-expanded={passwordOpen}
              aria-controls="password-sign-in"
              onClick={() => {
                setPasswordOpen(true);
                // Move focus into the form that just appeared.
                requestAnimationFrame(() =>
                  document.querySelector<HTMLInputElement>("#password-sign-in input")?.focus()
                );
              }}
              sx={{
                display: { xs: passwordOpen ? "none" : "flex", sm: "none" },
                minHeight: 48,
                textTransform: "none",
                fontWeight: 600,
              }}
            >
              Sign in with password
            </Button>

            {/* Login Form */}
            <Box
              id="password-sign-in"
              sx={{ display: { xs: passwordOpen ? "block" : "none", sm: "block" } }}
            >
            <form onSubmit={handleSubmit} noValidate aria-label="Sign in with email and password">
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={() => handleBlur("email")}
                margin="dense"
                required
                autoComplete="email"
                autoFocus={!email && passwordOpen}
                disabled={loading || isLocked}
                error={touched.email && !!formErrors.email}
                helperText={touched.email && formErrors.email}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon
                        color={
                          touched.email && formErrors.email ? "error" : "action"
                        }
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    "&:hover fieldset": {
                      borderColor: "primary.main",
                    },
                  },
                }}
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onBlur={() => handleBlur("password")}
                margin="dense"
                required
                autoComplete="current-password"
                disabled={loading || isLocked}
                error={touched.password && !!formErrors.password}
                helperText={touched.password && formErrors.password}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon
                        color={
                          touched.password && formErrors.password
                            ? "error"
                            : "action"
                        }
                      />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        disabled={loading || isLocked}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    "&:hover fieldset": {
                      borderColor: "primary.main",
                    },
                  },
                }}
              />

              {/* Remember Me */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mt: 0,
                  mb: 0.5,
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={loading || isLocked}
                      color="primary"
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      Remember me
                    </Typography>
                  }
                />
                <Link
                  href="/forgot-password"
                  variant="body2"
                  sx={{
                    textDecoration: "none",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  Forgot password?
                </Link>
              </Box>

              {/* Submit Button */}
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading || isLocked}
                sx={{
                  mt: 1,
                  mb: 0,
                  py: 1,
                  fontSize: "1rem",
                  fontWeight: 600,
                  textTransform: "none",
                  boxShadow: "0 4px 14px rgba(25, 118, 210, 0.4)",
                  "&:hover": {
                    boxShadow: "0 6px 20px rgba(25, 118, 210, 0.5)",
                  },
                }}
              >
                {loading ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={20} color="inherit" />
                    <span>Signing in...</span>
                  </Box>
                ) : isLocked ? (
                  `Locked (${lockoutDisplay})`
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
            </Box>

            {/* Footer */}
            <Box sx={{ mt: 1.5, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary" display="block">
                © {new Date().getFullYear()} Aesta Architects & Engineers · Pudukkottai, Tamil Nadu
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
                <Link
                  href="/privacy"
                  variant="caption"
                  color="text.secondary"
                  underline="always"
                  sx={{ display: "inline-flex", alignItems: "center", minHeight: { xs: 44, sm: 28 }, px: 1 }}
                >
                  Privacy policy
                </Link>
                <Link
                  href="/terms"
                  variant="caption"
                  color="text.secondary"
                  underline="always"
                  sx={{ display: "inline-flex", alignItems: "center", minHeight: { xs: 44, sm: 28 }, px: 1 }}
                >
                  Terms of use
                </Link>
              </Box>
            </Box>
          </CardContent>
        </Card>

      </Container>
    </Box>
  );
}
