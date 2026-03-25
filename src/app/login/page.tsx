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
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

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

  const { signIn, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("session_expired") === "true";

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
    // Load remembered email
    const remembered = localStorage.getItem(STORAGE_KEYS.REMEMBER_ME);
    if (remembered === "true") {
      const savedEmail = localStorage.getItem(STORAGE_KEYS.REMEMBERED_EMAIL);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    }

    // Check for existing lockout
    const storedLockout = localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    if (storedLockout) {
      const lockoutTime = parseInt(storedLockout, 10);
      if (lockoutTime > Date.now()) {
        setLockoutUntil(lockoutTime);
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
      router.push("/site/dashboard");
    }
  }, [user, authLoading, router]);

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

      setSuccessMessage("Login successful! Redirecting...");

      // Small delay to show success message
      setTimeout(() => {
        router.push("/site/dashboard");
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
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Card
          sx={{
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            {/* Logo and Title */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                mb: 4,
              }}
            >
              <Box
                sx={{
                  bgcolor: "primary.main",
                  borderRadius: "50%",
                  p: 2,
                  mb: 2,
                  boxShadow: "0 4px 14px rgba(25, 118, 210, 0.4)",
                }}
              >
                <Engineering sx={{ fontSize: 40, color: "white" }} />
              </Box>
              <Typography
                variant="h4"
                component="h1"
                fontWeight={700}
                gutterBottom
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
                sx={{ mb: 3 }}
              >
                Your session has expired. Please sign in again to continue.
              </Alert>
            )}

            {/* Success Message */}
            <Collapse in={!!successMessage}>
              <Alert
                severity="success"
                icon={<CheckCircleOutline />}
                sx={{ mb: 3 }}
              >
                {successMessage}
              </Alert>
            </Collapse>

            {/* Error Message */}
            <Collapse in={!!error}>
              <Alert
                severity="error"
                icon={<ErrorOutline />}
                sx={{ mb: 3 }}
                onClose={() => setError("")}
              >
                {error}
              </Alert>
            </Collapse>

            {/* Lockout Warning */}
            {isLocked && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                Account temporarily locked. Try again in{" "}
                <strong>{lockoutDisplay}</strong>
              </Alert>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} noValidate>
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={() => handleBlur("email")}
                margin="normal"
                required
                autoComplete="email"
                autoFocus={!email}
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
                margin="normal"
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
                  mt: 1,
                  mb: 2,
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
                  mt: 2,
                  mb: 2,
                  py: 1.5,
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

            {/* Footer */}
            <Box sx={{ mt: 3, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary">
                © {new Date().getFullYear()} Aesta Architects & Engineers
              </Typography>
              <Typography
                variant="caption"
                display="block"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Pudukkottai, Tamil Nadu
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* Version Info */}
        <Typography
          variant="caption"
          sx={{
            display: "block",
            textAlign: "center",
            mt: 2,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          Version 1.0.0
        </Typography>
      </Container>
    </Box>
  );
}
