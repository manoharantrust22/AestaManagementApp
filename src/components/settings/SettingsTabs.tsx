"use client";

import React, { useState } from "react";
import { Box, Tabs, Tab, Alert, Snackbar } from "@mui/material";
import {
  Person as PersonIcon,
  Security as SecurityIcon,
  Tune as TuneIcon,
  AccountCircle as AccountIcon,
  Group as GroupIcon,
  Business as BusinessIcon,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedCompany } from "@/contexts/CompanyContext";
import ProfileTab from "./ProfileTab";
import SecurityTab from "./SecurityTab";
import PreferencesTab from "./PreferencesTab";
import AccountTab from "./AccountTab";
import UsersManagement from "./UsersManagement";
import TeamManagement from "./TeamManagement";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `settings-tab-${index}`,
    "aria-controls": `settings-tabpanel-${index}`,
  };
}

interface SettingsTabsProps {
  defaultTab?: number;
}

export default function SettingsTabs({ defaultTab = 0 }: SettingsTabsProps) {
  const { userProfile } = useAuth();
  const { selectedCompany } = useSelectedCompany();
  const [value, setValue] = useState(defaultTab);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const isAdmin = userProfile?.role === "admin";

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const handleSuccess = (message: string) => {
    setSnackbar({ open: true, message, severity: "success" });
  };

  const handleError = (message: string) => {
    setSnackbar({ open: true, message, severity: "error" });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  // Define tabs with icons
  const tabs = [
    { label: "Profile", icon: <PersonIcon />, component: ProfileTab },
    { label: "Security", icon: <SecurityIcon />, component: SecurityTab },
    { label: "Preferences", icon: <TuneIcon />, component: PreferencesTab },
    { label: "Account", icon: <AccountIcon />, component: AccountTab },
  ];

  // Add Team tab if user has a company
  if (selectedCompany) {
    tabs.push({
      label: "Team",
      icon: <BusinessIcon />,
      component: TeamManagement as any,
    });
  }

  // Add Users tab for admin
  if (isAdmin) {
    tabs.push({
      label: "Users",
      icon: <GroupIcon />,
      component: UsersManagement as any,
    });
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          borderRadius: "12px 12px 0 0",
        }}
      >
        <Tabs
          value={value}
          onChange={handleChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="settings tabs"
          sx={{
            "& .MuiTab-root": {
              minHeight: 64,
              textTransform: "none",
              fontSize: "0.9rem",
              fontWeight: 500,
            },
            "& .MuiTabs-scrollButtons.Mui-disabled": { opacity: 0.25 },
          }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={index}
              label={tab.label}
              icon={tab.icon}
              iconPosition="start"
              {...a11yProps(index)}
            />
          ))}
        </Tabs>
      </Box>

      {tabs.map((tab, index) => {
        const TabComponent = tab.component;
        return (
          <TabPanel key={index} value={value} index={index}>
            <TabComponent onSuccess={handleSuccess} onError={handleError} />
          </TabPanel>
        );
      })}

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
