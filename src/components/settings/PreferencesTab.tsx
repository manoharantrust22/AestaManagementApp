"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  Palette as PaletteIcon,
  Schedule as ScheduleIcon,
  CalendarMonth as CalendarIcon,
  Language as LanguageIcon,
  Save as SaveIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { useThemeMode } from "@/contexts/ThemeContext";
import { createClient } from "@/lib/supabase/client";
type ThemePreference = string;

interface PreferencesTabProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "America/New_York", label: "New York (EST/EDT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (31/12/2024)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/31/2024)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2024-12-31)" },
  { value: "DD-MMM-YYYY", label: "DD-MMM-YYYY (31-Dec-2024)" },
];

export default function PreferencesTab({ onSuccess, onError }: PreferencesTabProps) {
  const { userProfile, refreshUserProfile } = useAuth();
  const { mode, setTheme } = useThemeMode();
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState({
    theme_preference: "light" as ThemePreference,
    timezone: "Asia/Kolkata",
    date_format: "DD/MM/YYYY",
  });

  const supabase = createClient();

  // Initialize preferences from user data
  useEffect(() => {
    if (userProfile) {
      setPreferences({
        theme_preference: (userProfile.theme_preference as ThemePreference) || "light",
        timezone: userProfile.timezone || "Asia/Kolkata",
        date_format: userProfile.date_format || "DD/MM/YYYY",
      });
    }
  }, [userProfile]);

  const handleThemeChange = async (newTheme: ThemePreference) => {
    setPreferences((prev) => ({ ...prev, theme_preference: newTheme }));
    setTheme(newTheme);

    // Save to database
    if (userProfile) {
      try {
        await (supabase.from("users") as any)
          .update({ theme_preference: newTheme })
          .eq("id", userProfile.id);
      } catch (error) {
        console.error("Failed to save theme preference:", error);
      }
    }
  };

  const handleSavePreferences = async () => {
    if (!userProfile) return;

    setLoading(true);
    try {
      const { error } = await (supabase.from("users") as any)
        .update({
          timezone: preferences.timezone,
          date_format: preferences.date_format,
        })
        .eq("id", userProfile.id);

      if (error) throw error;

      await refreshUserProfile();
      onSuccess?.("Preferences saved successfully");
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Failed to save preferences");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {/* Appearance */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Typography
          variant="h6"
          fontWeight={600}
          sx={{ display: "flex", alignItems: "center", mb: 3 }}
        >
          <PaletteIcon sx={{ mr: 1 }} />
          Appearance
        </Typography>

        <Box sx={{ display: "flex", gap: 2 }}>
          <Paper
            onClick={() => handleThemeChange("light")}
            sx={{
              p: 2,
              flex: 1,
              cursor: "pointer",
              border: 2,
              borderColor: mode === "light" ? "primary.main" : "divider",
              borderRadius: 2,
              textAlign: "center",
              transition: "all 0.2s",
              "&:hover": {
                borderColor: "primary.main",
                bgcolor: "action.hover",
              },
            }}
          >
            <LightModeIcon
              sx={{
                fontSize: 40,
                color: mode === "light" ? "primary.main" : "text.secondary",
                mb: 1,
              }}
            />
            <Typography
              variant="body2"
              fontWeight={mode === "light" ? 600 : 400}
            >
              Light
            </Typography>
          </Paper>

          <Paper
            onClick={() => handleThemeChange("dark")}
            sx={{
              p: 2,
              flex: 1,
              cursor: "pointer",
              border: 2,
              borderColor: mode === "dark" ? "primary.main" : "divider",
              borderRadius: 2,
              textAlign: "center",
              transition: "all 0.2s",
              "&:hover": {
                borderColor: "primary.main",
                bgcolor: "action.hover",
              },
            }}
          >
            <DarkModeIcon
              sx={{
                fontSize: 40,
                color: mode === "dark" ? "primary.main" : "text.secondary",
                mb: 1,
              }}
            />
            <Typography
              variant="body2"
              fontWeight={mode === "dark" ? 600 : 400}
            >
              Dark
            </Typography>
          </Paper>
        </Box>
      </Paper>

      {/* Regional Settings */}
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography
          variant="h6"
          fontWeight={600}
          sx={{ display: "flex", alignItems: "center", mb: 3 }}
        >
          <LanguageIcon sx={{ mr: 1 }} />
          Regional Settings
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <FormControl fullWidth>
            <InputLabel>Timezone</InputLabel>
            <Select
              value={preferences.timezone}
              label="Timezone"
              onChange={(e) =>
                setPreferences((prev) => ({
                  ...prev,
                  timezone: e.target.value,
                }))
              }
              startAdornment={
                <ScheduleIcon sx={{ mr: 1, color: "action.active" }} />
              }
            >
              {TIMEZONES.map((tz) => (
                <MenuItem key={tz.value} value={tz.value}>
                  {tz.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Date Format</InputLabel>
            <Select
              value={preferences.date_format}
              label="Date Format"
              onChange={(e) =>
                setPreferences((prev) => ({
                  ...prev,
                  date_format: e.target.value,
                }))
              }
              startAdornment={
                <CalendarIcon sx={{ mr: 1, color: "action.active" }} />
              }
            >
              {DATE_FORMATS.map((df) => (
                <MenuItem key={df.value} value={df.value}>
                  {df.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="contained"
              onClick={handleSavePreferences}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
            >
              {loading ? "Saving..." : "Save Preferences"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Language (Coming Soon) */}
      <Paper sx={{ p: 3, mt: 3, borderRadius: 3, opacity: 0.6 }}>
        <Typography
          variant="h6"
          fontWeight={600}
          sx={{ display: "flex", alignItems: "center", mb: 2 }}
        >
          <LanguageIcon sx={{ mr: 1 }} />
          Language
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Language settings coming soon. Currently, the app is available in English only.
        </Typography>
      </Paper>
    </Box>
  );
}
