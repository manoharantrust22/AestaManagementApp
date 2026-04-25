"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Tabs,
  Tab,
  Tooltip,
  useTheme,
  Switch,
  Chip,
  Snackbar,
  Alert,
  Badge,
} from "@mui/material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSessionRefresh } from "@/hooks/useSessionRefresh";
import {
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Dashboard as DashboardIcon,
  Engineering,
  Logout,
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  People as PeopleIcon,
  Groups as GroupsIcon,
  AccessTime as AccessTimeIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  Description as DescriptionIcon,
  Assessment as AssessmentIcon,
  EventBusy as EventBusyIcon,
  Notes as NotesIcon,
  Business as BusinessIcon,
  Domain as DomainIcon,
  Person as PersonIcon,
  PaymentOutlined as PaymentIcon,
  LocalCafe as LocalCafeIcon,
  Payments as PaymentsIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  UploadFile as UploadFileIcon,
  Inventory2 as InventoryIcon,
  Construction as ConstructionIcon,
  Store as StoreIcon,
  Category as CategoryIcon,
  ShoppingCart as ShoppingCartIcon,
  Assignment as AssignmentIcon,
  Refresh as RefreshIcon,
  Sync as SyncIcon,
  SyncDisabled as SyncDisabledIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  CalendarMonth as CalendarIcon,
  LocalShipping as DeliveryIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  HomeWork as RentalIcon,
  ReceiptLong as ReceiptLongIcon,
  Build as BuildIcon,
  Videocam as VideocamIcon,
} from "@mui/icons-material";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useThemeMode } from "@/contexts/ThemeContext";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import SiteSelector from "@/components/layout/SiteSelector";
import { useSelectedSite } from "@/contexts/SiteContext";
import NotificationBell from "@/components/notifications/NotificationBell";
import ActiveSectionChip from "@/components/layout/ActiveSectionChip";
import SettlementDialogManager from "@/components/settlement/SettlementDialogManager";
import ChatAssistant from "@/components/chat-assistant/ChatAssistant";
import ThemeToggle from "@/components/common/ThemeToggle";
import DateRangePicker from "@/components/common/DateRangePicker";
import ManualRefreshButton from "@/components/common/ManualRefreshButton";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
  useMaterialWorkflowSummary,
  getBadgeCounts,
  type MaterialBadgeCounts,
} from "@/hooks/queries/useMaterialWorkflowSummary";

const drawerWidth = 260;
const iconBarWidth = 64;
const collapsedDrawerWidth = 0;

type SidebarState = "open" | "iconBar" | "closed";

interface NavItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  adminOnly?: boolean;
  badgeKey?: string; // maps to MaterialBadgeCounts field for sidebar badge
}

interface NavCategory {
  label: string;
  emoji: string;
  items: NavItem[];
}

// Dashboard items (not in categories)
const siteDashboard: NavItem = {
  text: "Dashboard",
  icon: <DashboardIcon />,
  path: "/site/dashboard",
};

const companyDashboard: NavItem = {
  text: "Dashboard",
  icon: <DashboardIcon />,
  path: "/company/dashboard",
};

// Site-specific menu items organized by category
const siteNavCategories: NavCategory[] = [
  {
    label: "Workforce",
    emoji: "👷",
    items: [
      {
        text: "Attendance",
        icon: <AccessTimeIcon />,
        path: "/site/attendance",
      },
      {
        text: "Salary Settlements",
        icon: <PaymentsIcon />,
        path: "/site/payments",
      },
      { text: "Holidays", icon: <EventBusyIcon />, path: "/site/holidays" },
    ],
  },
  {
    label: "Expenses",
    emoji: "💰",
    items: [
      {
        text: "All Site Expenses",
        icon: <AccountBalanceWalletIcon />,
        path: "/site/expenses",
      },
      {
        text: "Miscellaneous",
        icon: <ReceiptLongIcon />,
        path: "/site/expenses/miscellaneous",
      },
      {
        text: "My Wallet",
        icon: <AccountBalanceWalletIcon />,
        path: "/site/my-wallet",
      },
      {
        text: "T&S Settlement",
        icon: <LocalCafeIcon />,
        path: "/site/tea-shop",
      },
      {
        text: "Client Payments",
        icon: <PaymentIcon />,
        path: "/site/client-payments",
      },
    ],
  },
  {
    label: "Site Operations",
    emoji: "🏗️",
    items: [
      { text: "Daily Work Log", icon: <NotesIcon />, path: "/site/work-log" },
      { text: "Site Reports", icon: <AssessmentIcon />, path: "/site/reports" },
    ],
  },
  {
    label: "Materials",
    emoji: "📦",
    items: [
      {
        text: "Overview",
        icon: <DashboardIcon />,
        path: "/site/materials",
      },
      {
        text: "Inventory",
        icon: <InventoryIcon />,
        path: "/site/inventory",
      },
      {
        text: "Material Requests",
        icon: <AssignmentIcon />,
        path: "/site/material-requests",
        badgeKey: "requests",
      },
      {
        text: "Purchase Orders",
        icon: <ShoppingCartIcon />,
        path: "/site/purchase-orders",
        badgeKey: "purchaseOrders",
      },
      {
        text: "Delivery Verification",
        icon: <DeliveryIcon />,
        path: "/site/delivery-verification",
        badgeKey: "deliveries",
      },
      {
        text: "Inter-Site Settlement",
        icon: <AccountBalanceIcon />,
        path: "/site/inter-site-settlement",
        badgeKey: "interSite",
      },
      {
        text: "Material Settlements",
        icon: <PaymentIcon />,
        path: "/site/material-settlements",
        badgeKey: "settlements",
      },
      {
        text: "Material Expenses",
        icon: <AccountBalanceWalletIcon />,
        path: "/site/material-expenses",
      },
      {
        text: "Rentals",
        icon: <RentalIcon />,
        path: "/site/rentals",
      },
    ],
  },
  {
    label: "Contracts",
    emoji: "🤝",
    items: [
      {
        text: "Subcontracts",
        icon: <DescriptionIcon />,
        path: "/site/subcontracts",
      },
    ],
  },
  {
    label: "Settings",
    emoji: "⚙️",
    items: [
      { text: "Site Settings", icon: <SettingsIcon />, path: "/site/settings" },
    ],
  },
];

// Company-wide menu items organized by category
const companyNavCategories: NavCategory[] = [
  {
    label: "Workforce",
    emoji: "👷",
    items: [
      { text: "Laborers", icon: <PeopleIcon />, path: "/company/laborers" },
      { text: "Teams", icon: <GroupsIcon />, path: "/company/teams" },
      {
        text: "Market Laborer Rates",
        icon: <PaymentsIcon />,
        path: "/company/market-laborers",
      },
    ],
  },
  {
    label: "Equipment & Assets",
    emoji: "🔧",
    items: [
      {
        text: "Equipment",
        icon: <BuildIcon />,
        path: "/company/equipment",
      },
      {
        text: "Cameras",
        icon: <VideocamIcon />,
        path: "/company/equipment?tab=surveillance",
      },
    ],
  },
  {
    label: "Contracts & Payments",
    emoji: "🤝",
    items: [
      {
        text: "All Subcontracts",
        icon: <DescriptionIcon />,
        path: "/company/contracts",
      },
      {
        text: "Engineer Wallet",
        icon: <PaymentIcon />,
        path: "/company/engineer-wallet",
      },
    ],
  },
  {
    label: "Materials & Vendors",
    emoji: "🧱",
    items: [
      {
        text: "Material Catalog",
        icon: <CategoryIcon />,
        path: "/company/materials",
      },
      {
        text: "Categories",
        icon: <InventoryIcon />,
        path: "/company/categories",
      },
      {
        text: "Price Comparison",
        icon: <TrendingUpIcon />,
        path: "/company/material-search",
      },
      {
        text: "Vendor Directory",
        icon: <StoreIcon />,
        path: "/company/vendors",
      },
      {
        text: "Tea Shops",
        icon: <LocalCafeIcon />,
        path: "/company/tea-shops",
      },
      {
        text: "Site Groups",
        icon: <GroupsIcon />,
        path: "/company/site-groups",
      },
      {
        text: "Rentals",
        icon: <RentalIcon />,
        path: "/company/rentals",
      },
    ],
  },
  {
    label: "Project Setup",
    emoji: "🏗️",
    items: [
      {
        text: "Sites",
        icon: <DomainIcon />,
        path: "/company/sites",
        adminOnly: true,
      },
      {
        text: "Construction Phases",
        icon: <Engineering />,
        path: "/company/construction-phases",
        adminOnly: true,
      },
    ],
  },
  {
    label: "Data Management",
    emoji: "📤",
    items: [
      {
        text: "Mass Upload",
        icon: <UploadFileIcon />,
        path: "/company/mass-upload",
      },
    ],
  },
  {
    label: "Reports",
    emoji: "📈",
    items: [
      {
        text: "Company Reports",
        icon: <AssessmentIcon />,
        path: "/company/reports",
      },
    ],
  },
];

type ActiveTab = "site" | "company";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarState, setSidebarState] = useState<SidebarState>("open");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("site");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  // Snackbar state for refresh feedback
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "warning" | "info";
  }>({ open: false, message: "", severity: "info" });

  const { user, userProfile, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useIsMobile("md");
  const { mode, toggleTheme } = useThemeMode();
  const syncStatus = useSyncStatus();
  const { selectedSite } = useSelectedSite();

  // Material workflow badge counts for sidebar
  const workflowSummary = useMaterialWorkflowSummary(
    activeTab === "site" ? selectedSite?.id : undefined
  );
  const materialBadges = getBadgeCounts(workflowSummary);
  const {
    startDate,
    endDate,
    setDateRange,
    setToday,
    setLastWeek,
    setLastMonth,
    label: dateRangeLabel,
    pickerOpen,
    closePicker,
  } = useDateRange();

  // Refresh session on navigation (since middleware doesn't run on client-side navigation)
  useSessionRefresh();

  // Redirect to /login when there is no authenticated user. Middleware should
  // catch this on full requests, but RSC navigations + client-side state drift
  // can leave the layout rendered for a logged-out user (empty avatar "U",
  // "Welcome back, User", no sites).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // Determine active tab based on current path
  useEffect(() => {
    if (pathname.startsWith("/company")) {
      setActiveTab("company");
    } else if (pathname.startsWith("/site")) {
      setActiveTab("site");
    }
  }, [pathname]);

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      // Cycle through: open -> iconBar -> closed -> open
      setSidebarState((prev) => {
        if (prev === "open") return "iconBar";
        if (prev === "iconBar") return "closed";
        return "open";
      });
    }
  };

  // Calculate current drawer width based on state
  const getCurrentDrawerWidth = () => {
    if (isMobile) return drawerWidth;
    switch (sidebarState) {
      case "open":
        return drawerWidth;
      case "iconBar":
        return iconBarWidth;
      case "closed":
        return collapsedDrawerWidth;
    }
  };

  const currentDrawerWidth = getCurrentDrawerWidth();
  const isIconBarMode = sidebarState === "iconBar" && !isMobile;

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    handleUserMenuClose();
    try {
      await signOut();
    } catch (error) {
      console.error("[MainLayout] Sign out error:", error);
    }
    router.replace("/login");
  };

  const handleSettings = () => {
    handleUserMenuClose();
    router.push("/settings");
  };

  const handleTabChange = (
    _event: React.SyntheticEvent,
    newValue: ActiveTab
  ) => {
    setActiveTab(newValue);
    // Navigate to the respective dashboard
    if (newValue === "site") {
      router.push("/site/dashboard");
    } else {
      router.push("/company/dashboard");
    }
  };

  const handleNavigation = (path: string) => {
    router.push(path);
    if (isMobile) setMobileOpen(false);
  };

  const toggleCategory = (categoryLabel: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryLabel)) {
        newSet.delete(categoryLabel);
      } else {
        newSet.add(categoryLabel);
      }
      return newSet;
    });
  };

  const currentNavCategories =
    activeTab === "site" ? siteNavCategories : companyNavCategories;

  // Filter out categories based on permissions
  // Temporarily showing all items to all users during development
  const filteredNavCategories = currentNavCategories
    .map((category) => ({
      ...category,
      items: category.items.filter(() => true), // All items visible to all users
    }))
    .filter((category) => category.items.length > 0); // Remove empty categories

  // Icon Bar Drawer - Compact version showing only icons
  const iconBarDrawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Logo Icon Only */}
      <Toolbar
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 1,
          py: 2,
          minHeight: 64,
        }}
      >
        <Engineering sx={{ fontSize: 28, color: "primary.main" }} />
      </Toolbar>

      <Divider />

      {/* Tab Icons */}
      <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
        <Tooltip title={activeTab === "site" ? "Site" : "Company"} placement="right">
          <IconButton
            onClick={() => handleTabChange(null as unknown as React.SyntheticEvent, activeTab === "site" ? "company" : "site")}
            sx={{ color: "primary.main" }}
          >
            {activeTab === "site" ? <DomainIcon /> : <BusinessIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Divider />

      {/* Navigation Icons */}
      <List sx={{ px: 0.5, py: 1, flex: 1, overflowY: "auto" }}>
        {/* Dashboard Icon */}
        <ListItem disablePadding sx={{ mb: 1 }}>
          <Tooltip title="Dashboard" placement="right">
            <ListItemButton
              onClick={() =>
                handleNavigation(
                  activeTab === "site"
                    ? siteDashboard.path
                    : companyDashboard.path
                )
              }
              sx={{
                borderRadius: 2,
                py: 1,
                justifyContent: "center",
                bgcolor:
                  (activeTab === "site" && pathname === siteDashboard.path) ||
                  (activeTab === "company" && pathname === companyDashboard.path)
                    ? "primary.main"
                    : "transparent",
                color:
                  (activeTab === "site" && pathname === siteDashboard.path) ||
                  (activeTab === "company" && pathname === companyDashboard.path)
                    ? "white"
                    : "text.primary",
                "&:hover": {
                  bgcolor:
                    (activeTab === "site" && pathname === siteDashboard.path) ||
                    (activeTab === "company" && pathname === companyDashboard.path)
                      ? "primary.dark"
                      : "action.hover",
                },
              }}
            >
              <DashboardIcon />
            </ListItemButton>
          </Tooltip>
        </ListItem>

        {/* Category Icons */}
        {filteredNavCategories.map((category) => (
          <Box key={category.label} sx={{ mb: 0.5 }}>
            {category.items.map((item) => {
              // Check if another nav item has an exact match - if so, don't highlight this item via startsWith
              const hasExactMatchElsewhere = filteredNavCategories.some(cat =>
                cat.items.some(i => i.path !== item.path && pathname === i.path)
              );
              const isActive = hasExactMatchElsewhere
                ? pathname === item.path
                : pathname === item.path || pathname.startsWith(`${item.path}/`);

              const badgeCount = item.badgeKey
                ? materialBadges[
                    item.badgeKey as keyof MaterialBadgeCounts
                  ] || 0
                : 0;

              return (
                <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                  <Tooltip title={item.text} placement="right">
                    <ListItemButton
                      onClick={() => handleNavigation(item.path)}
                      sx={{
                        borderRadius: 2,
                        py: 1,
                        justifyContent: "center",
                        bgcolor: isActive ? "primary.main" : "transparent",
                        color: isActive ? "white" : "text.secondary",
                        "&:hover": {
                          bgcolor: isActive ? "primary.dark" : "action.hover",
                        },
                      }}
                    >
                      {badgeCount > 0 ? (
                        <Badge
                          badgeContent={badgeCount}
                          color="warning"
                          sx={{
                            "& .MuiBadge-badge": {
                              fontSize: "0.55rem",
                              height: 14,
                              minWidth: 14,
                            },
                          }}
                        >
                          {item.icon}
                        </Badge>
                      ) : (
                        item.icon
                      )}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
              );
            })}
          </Box>
        ))}
      </List>

      {/* User Section - Icons Only */}
      <Divider />
      <Box sx={{ p: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
        <Tooltip title="Account settings" placement="right">
          <IconButton onClick={handleUserMenuOpen} sx={{ p: 0.5 }}>
            <Avatar
              src={userProfile?.avatar_url || undefined}
              sx={{
                bgcolor: "primary.main",
                width: 32,
                height: 32,
                fontSize: "0.8rem",
              }}
            >
              {userProfile?.name?.charAt(0).toUpperCase() || "U"}
            </Avatar>
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Logo Header */}
      <Toolbar
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 2,
          py: 2,
        }}
      >
        <Engineering sx={{ fontSize: 32, color: "primary.main", mr: 1 }} />
        <Typography variant="h6" fontWeight={600} color="primary">
          Aesta
        </Typography>
      </Toolbar>

      <Divider />

      {/* Tab Switcher */}
      <Box sx={{ px: 1, py: 1.5 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            minHeight: 40,
            bgcolor: "action.hover",
            borderRadius: 2,
            "& .MuiTabs-indicator": {
              height: "100%",
              borderRadius: 2,
              zIndex: 0,
            },
            "& .MuiTab-root": {
              minHeight: 40,
              zIndex: 1,
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8rem",
            },
            "& .Mui-selected": {
              color: "white !important",
            },
          }}
        >
          <Tab
            icon={<DomainIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Site"
            value="site"
            sx={{ gap: 0.5 }}
          />
          <Tab
            icon={<BusinessIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Company"
            value="company"
            sx={{ gap: 0.5 }}
          />
        </Tabs>
      </Box>

      <Divider />

      {/* Navigation Menu */}
      <List sx={{ px: 1.5, py: 1, flex: 1, overflowY: "auto" }}>
        {/* Dashboard - Always visible, not in a category */}
        <ListItem disablePadding sx={{ mb: 1.5 }}>
          <ListItemButton
            onClick={() =>
              handleNavigation(
                activeTab === "site"
                  ? siteDashboard.path
                  : companyDashboard.path
              )
            }
            sx={{
              borderRadius: 2,
              py: 1.25,
              bgcolor:
                (activeTab === "site" && pathname === siteDashboard.path) ||
                (activeTab === "company" && pathname === companyDashboard.path)
                  ? "primary.main"
                  : "transparent",
              color:
                (activeTab === "site" && pathname === siteDashboard.path) ||
                (activeTab === "company" && pathname === companyDashboard.path)
                  ? "white"
                  : "text.primary",
              "&:hover": {
                bgcolor:
                  (activeTab === "site" && pathname === siteDashboard.path) ||
                  (activeTab === "company" &&
                    pathname === companyDashboard.path)
                    ? "primary.dark"
                    : "action.hover",
              },
            }}
          >
            <ListItemIcon
              sx={{
                color:
                  (activeTab === "site" && pathname === siteDashboard.path) ||
                  (activeTab === "company" &&
                    pathname === companyDashboard.path)
                    ? "white"
                    : "text.secondary",
                minWidth: 40,
              }}
            >
              <DashboardIcon />
            </ListItemIcon>
            <ListItemText
              primary="Dashboard"
              primaryTypographyProps={{
                fontWeight:
                  (activeTab === "site" && pathname === siteDashboard.path) ||
                  (activeTab === "company" &&
                    pathname === companyDashboard.path)
                    ? 600
                    : 500,
                fontSize: "0.875rem",
              }}
            />
          </ListItemButton>
        </ListItem>

        {/* Collapsible Categories */}
        {filteredNavCategories.map((category, categoryIndex) => {
          const isExpanded = expandedCategories.has(category.label);

          return (
            <Box
              key={category.label}
              sx={{
                mb: categoryIndex < filteredNavCategories.length - 1 ? 1.5 : 0,
              }}
            >
              {/* Category Header - Clickable */}
              <ListItemButton
                onClick={() => toggleCategory(category.label)}
                sx={{
                  borderRadius: 2,
                  px: 1.5,
                  py: 0.75,
                  mb: 0.5,
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    flexGrow: 1,
                  }}
                >
                  <span style={{ fontSize: "1rem" }}>{category.emoji}</span>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      color: "text.secondary",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {category.label}
                  </Typography>
                </Box>
                {isExpanded ? (
                  <ExpandLessIcon
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                ) : (
                  <ExpandMoreIcon
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                )}
              </ListItemButton>

              {/* Category Items - Only shown when expanded */}
              {isExpanded &&
                category.items.map((item) => {
                  // Check if another nav item has an exact match - if so, don't highlight this item via startsWith
                  const hasExactMatchElsewhere = filteredNavCategories.some(cat =>
                    cat.items.some(i => i.path !== item.path && pathname === i.path)
                  );
                  const isActive = hasExactMatchElsewhere
                    ? pathname === item.path
                    : pathname === item.path || pathname.startsWith(`${item.path}/`);

                  return (
                    <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        onClick={() => handleNavigation(item.path)}
                        sx={{
                          borderRadius: 2,
                          py: 1,
                          pl: 3.5,
                          bgcolor: isActive ? "primary.main" : "transparent",
                          color: isActive ? "white" : "text.primary",
                          "&:hover": {
                            bgcolor: isActive ? "primary.dark" : "action.hover",
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            color: isActive ? "white" : "text.secondary",
                            minWidth: 40,
                          }}
                        >
                          {item.badgeKey ? (
                            <Badge
                              badgeContent={
                                materialBadges[
                                  item.badgeKey as keyof MaterialBadgeCounts
                                ] || 0
                              }
                              color="warning"
                              invisible={
                                !materialBadges[
                                  item.badgeKey as keyof MaterialBadgeCounts
                                ]
                              }
                              sx={{
                                "& .MuiBadge-badge": {
                                  fontSize: "0.6rem",
                                  height: 16,
                                  minWidth: 16,
                                  right: -4,
                                  top: -2,
                                },
                              }}
                            >
                              {item.icon}
                            </Badge>
                          ) : (
                            item.icon
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.text}
                          primaryTypographyProps={{
                            fontWeight: isActive ? 600 : 400,
                            fontSize: "0.875rem",
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
            </Box>
          );
        })}
      </List>

      {/* User Section - Fixed at bottom */}
      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Tooltip title="Account settings">
            <IconButton
              onClick={handleUserMenuOpen}
              sx={{ p: 0.5 }}
            >
              <Avatar
                src={userProfile?.avatar_url || undefined}
                sx={{
                  bgcolor: "primary.main",
                  width: 36,
                  height: 36,
                  fontSize: "0.85rem",
                }}
              >
                {userProfile?.name?.charAt(0).toUpperCase() || "U"}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={500}
              noWrap
              sx={{ fontSize: "0.85rem" }}
            >
              {userProfile?.display_name || userProfile?.name || "User"}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ fontSize: "0.7rem" }}
            >
              {userProfile?.role
                ? userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)
                : ""}
            </Typography>
          </Box>
          <ThemeToggle />
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
      }}
    >
      {/* Top App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${currentDrawerWidth}px)` },
          ml: { md: `${currentDrawerWidth}px` },
          bgcolor: "background.paper",
          color: "text.primary",
          borderRadius: 0,
          transition: theme.transitions.create(["width", "margin"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar sx={{ px: { xs: 1, sm: 2 }, minHeight: { xs: 56, sm: 64 } }}>
          {/* Menu Toggle - Mobile only */}
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{
              mr: { xs: 0.5, sm: 2 },
              display: { xs: "flex", md: "none" },
            }}
          >
            <MenuIcon />
          </IconButton>

          {/* Site Selector - Only visible on Site tab */}
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {activeTab === "site" && (
              <>
                <SiteSelector />
                <ActiveSectionChip />
              </>
            )}
            {activeTab === "company" && (
              <Typography
                variant="h6"
                fontWeight={500}
                color="text.secondary"
                sx={{ display: { xs: "none", sm: "block" } }}
              >
                Company
              </Typography>
            )}
          </Box>

          {/* Spacer */}
          <Box sx={{ flexGrow: 1 }} />

          {/* Global Date Range Controls */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 0.5, sm: 1 },
              mr: { xs: 0.5, sm: 1 },
            }}
          >
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                setDateRange(start, end);
                closePicker();
              }}
              minDate={selectedSite?.start_date ? new Date(selectedSite.start_date) : undefined}
              forceOpen={pickerOpen}
              onPopoverClose={() => closePicker()}
            />

            {/* Quick chips — hidden on mobile */}
            <Chip
              label="Today"
              size="small"
              variant={dateRangeLabel === "Today" ? "filled" : "outlined"}
              color={dateRangeLabel === "Today" ? "primary" : "default"}
              onClick={() => setToday()}
              sx={{
                display: { xs: "none", sm: "flex" },
                cursor: "pointer",
                minWidth: 56,
                fontWeight: dateRangeLabel === "Today" ? 600 : 400,
              }}
            />
            <Chip
              label="Week"
              size="small"
              variant={dateRangeLabel === "This Week" ? "filled" : "outlined"}
              color={dateRangeLabel === "This Week" ? "primary" : "default"}
              onClick={() => setLastWeek()}
              sx={{
                display: { xs: "none", sm: "flex" },
                cursor: "pointer",
                minWidth: 56,
                fontWeight: dateRangeLabel === "This Week" ? 600 : 400,
              }}
            />
            <Chip
              label="Month"
              size="small"
              variant={dateRangeLabel === "This Month" ? "filled" : "outlined"}
              color={dateRangeLabel === "This Month" ? "primary" : "default"}
              onClick={() => setLastMonth()}
              sx={{
                display: { xs: "none", sm: "flex" },
                cursor: "pointer",
                minWidth: 64,
                fontWeight: dateRangeLabel === "This Month" ? 600 : 400,
              }}
            />
          </Box>

          {/* Manual Refresh Button */}
          <ManualRefreshButton />

          {/* Notification Bell */}
          <Box sx={{ ml: { xs: 0.5, sm: 1 } }}>
            <NotificationBell />
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            PaperProps={{
              sx: { minWidth: 220, mt: 1 },
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Avatar
                src={userProfile?.avatar_url || undefined}
                sx={{
                  width: 48,
                  height: 48,
                  bgcolor: "primary.main",
                }}
              >
                {userProfile?.name?.charAt(0).toUpperCase() || "U"}
              </Avatar>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {userProfile?.display_name || userProfile?.name}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: "0.75rem" }}
                >
                  {userProfile?.email}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: "inline-block",
                    mt: 0.5,
                    px: 1,
                    py: 0.25,
                    bgcolor: "primary.light",
                    color: "primary.dark",
                    borderRadius: 1,
                    fontWeight: 600,
                    fontSize: "0.65rem",
                  }}
                >
                  {userProfile?.role?.toUpperCase()}
                </Typography>
              </Box>
            </Box>
            <Divider />
            <MenuItem onClick={handleSettings}>
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>My Profile</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleSettings}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Settings</ListItemText>
            </MenuItem>
            <MenuItem onClick={toggleTheme}>
              <ListItemIcon>
                {mode === "dark" ? (
                  <LightModeIcon fontSize="small" />
                ) : (
                  <DarkModeIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>
                {mode === "dark" ? "Light Mode" : "Dark Mode"}
              </ListItemText>
              <Switch
                edge="end"
                checked={mode === "dark"}
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTheme();
                }}
              />
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleSignOut}>
              <ListItemIcon>
                <Logout fontSize="small" />
              </ListItemIcon>
              <ListItemText>Sign Out</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
      <Box
        component="nav"
        sx={{
          width: { md: currentDrawerWidth },
          flexShrink: { md: 0 },
          transition: theme.transitions.create("width", {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          position: "relative",
        }}
      >
        {/* Toggle Button - Desktop only */}
        {!isMobile && (
          <IconButton
            onClick={handleDrawerToggle}
            size="small"
            sx={{
              display: { xs: "none", md: "flex" },
              position: "fixed",
              left: currentDrawerWidth - 12,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: theme.zIndex.drawer + 2,
              bgcolor: "background.paper",
              color: "text.secondary",
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: 1,
              transition: theme.transitions.create(["left", "background-color"], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
              "&:hover": {
                bgcolor: "action.hover",
                boxShadow: 2,
              },
            }}
          >
            {sidebarState === "closed" ? (
              <ChevronRightIcon sx={{ fontSize: 16 }} />
            ) : (
              <ChevronLeftIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        )}

        {/* Mobile Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: currentDrawerWidth,
              transition: theme.transitions.create("width", {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
              overflowX: "hidden",
            },
          }}
          open
        >
          {sidebarState !== "closed" && (isIconBarMode ? iconBarDrawer : drawer)}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          width: { xs: "100%", md: `calc(100% - ${currentDrawerWidth}px)` },
          maxWidth: "100%",
          minHeight: "100vh",
          bgcolor: "background.default",
          overflowX: "hidden",
          transition: theme.transitions.create(["width", "margin"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }} />
        {children}
      </Box>

      {/* Settlement Dialogs (managed via NotificationContext) */}
      <SettlementDialogManager />

      {/* Chat Assistant */}
      <ChatAssistant />

      {/* Refresh feedback snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
