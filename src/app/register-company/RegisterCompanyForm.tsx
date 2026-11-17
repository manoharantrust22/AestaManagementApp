"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Collapse,
  Grid,
  InputAdornment,
} from "@mui/material";
import {
  Business as BusinessIcon,
  CheckCircleOutline,
  ErrorOutline,
  LocationCity,
  Phone,
  Email as EmailIcon,
  Badge,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterCompanyForm() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    city: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return "Company name is required";
    }
    if (!formData.code.trim()) {
      return "Company code is required";
    }
    if (formData.code.length < 2 || formData.code.length > 20) {
      return "Company code must be 2-20 characters";
    }
    if (!/^[A-Z0-9_-]+$/i.test(formData.code)) {
      return "Company code can only contain letters, numbers, hyphens, and underscores";
    }
    if (!formData.city.trim()) {
      return "City is required";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!userProfile) {
      setError("You must be logged in to register a company");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Server route: admin check + service-role writes (company + owner).
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Failed to register company. Please try again.");
      }

      setSuccess("Company registered successfully! Redirecting...");

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/site/dashboard");
        router.refresh();
      }, 1500);
    } catch (err: any) {
      console.error("Error registering company:", err);
      setError(err.message || "Failed to register company. Please try again.");
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

  // Redirect to login if not authenticated
  if (!userProfile) {
    router.push("/login");
    return null;
  }

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
                <BusinessIcon sx={{ fontSize: 40, color: "white" }} />
              </Box>
              <Typography
                variant="h4"
                component="h1"
                fontWeight={700}
                gutterBottom
                textAlign="center"
              >
                Register Your Company
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                Set up your construction company on Aesta
              </Typography>
            </Box>

            {/* Success Message */}
            <Collapse in={!!success}>
              <Alert
                severity="success"
                icon={<CheckCircleOutline />}
                sx={{ mb: 3 }}
              >
                {success}
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

            {/* Registration Form */}
            <form onSubmit={handleSubmit} noValidate>
              <Grid container spacing={2}>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Company Name"
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    required
                    disabled={loading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <BusinessIcon color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Company Code"
                    value={formData.code}
                    onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                    required
                    disabled={loading}
                    placeholder="e.g., ACME"
                    helperText="Short unique identifier"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Badge color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="City"
                    value={formData.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    required
                    disabled={loading}
                    placeholder="e.g., Pudukkottai"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LocationCity color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Phone"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    disabled={loading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Phone color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    disabled={loading}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <EmailIcon color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Address"
                    value={formData.address}
                    onChange={(e) => handleChange("address", e.target.value)}
                    disabled={loading}
                    multiline
                    rows={2}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="GST Number"
                    value={formData.gst_number}
                    onChange={(e) => handleChange("gst_number", e.target.value.toUpperCase())}
                    disabled={loading}
                    placeholder="e.g., 33AAAAA0000A1Z5"
                  />
                </Grid>
              </Grid>

              {/* Submit Button */}
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  mt: 3,
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
                    <span>Registering...</span>
                  </Box>
                ) : (
                  "Register Company"
                )}
              </Button>
            </form>

            {/* Footer */}
            <Box sx={{ mt: 3, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary">
                You will be the owner of this company and can invite team members later.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
