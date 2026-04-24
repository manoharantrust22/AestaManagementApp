"use client";

import React, { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Box,
  Typography,
  Tab,
  Tabs,
  Paper,
  Alert,
  Snackbar,
  Button,
} from "@mui/material";
import {
  Person as PersonIcon,
  Groups as GroupsIcon,
  ArrowBack as ArrowBackIcon,
} from "@mui/icons-material";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import PageHeader from "@/components/layout/PageHeader";
import PaymentSummaryCards from "@/components/payments/PaymentSummaryCards";
import ScopePill from "@/components/common/ScopePill";
const DailyMarketPaymentsTab = dynamic(
  () => import("@/components/payments/DailyMarketPaymentsTab"),
  { ssr: false }
);
const ContractWeeklyPaymentsTab = dynamic(
  () => import("@/components/payments/ContractWeeklyPaymentsTab"),
  { ssr: false }
);
import dayjs from "dayjs";
import { useSearchParams, useRouter } from "next/navigation";
import type { PaymentPageData } from "@/lib/data/payments";
import type { PaymentSummaryData } from "@/types/payment.types";

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
      id={`payment-tabpanel-${index}`}
      aria-labelledby={`payment-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

interface PaymentsContentProps {
  initialData: PaymentPageData | null;
}

export default function PaymentsContent({ initialData }: PaymentsContentProps) {
  const { selectedSite } = useSelectedSite();
  const { formatForApi, isAllTime } = useDateRange();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { dateFrom, dateTo } = formatForApi();

  // URL params for highlighting (from redirect)
  const highlightDate = searchParams.get("date");
  const highlightAction = searchParams.get("action");
  const highlightTransactionId = searchParams.get("transactionId");
  const highlightRef = searchParams.get("highlight");
  const tabParam = searchParams.get("tab");

  // Notification snackbar state
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  // Handle URL params for highlighting (from redirect)
  useEffect(() => {
    if (highlightDate && highlightAction === "edit_or_delete") {
      const formattedDate = dayjs(highlightDate).format("DD MMM YYYY");
      setNotificationMessage(
        `Cancel or modify the payment for ${formattedDate} to update the linked expense`
      );
    }
  }, [highlightDate, highlightAction]);

  // Tab state - initialize based on URL param
  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam === "salary" || tabParam === "daily") return 0;
    if (tabParam === "contract" || tabParam === "weekly") return 1;
    return 0;
  });

  // Update tab when URL param changes
  useEffect(() => {
    if (tabParam === "salary" || tabParam === "daily") setActiveTab(0);
    if (tabParam === "contract" || tabParam === "weekly") setActiveTab(1);
  }, [tabParam]);

  // Empty summary for initialization
  const emptySummary: PaymentSummaryData = {
    dailyMarketPending: 0,
    dailyMarketPendingCount: 0,
    dailyMarketSentToEngineer: 0,
    dailyMarketSentToEngineerCount: 0,
    dailyMarketPaid: 0,
    dailyMarketPaidCount: 0,
    contractWeeklyDue: 0,
    contractWeeklyDueLaborerCount: 0,
    contractWeeklyPaid: 0,
    bySubcontract: [],
    unlinkedTotal: 0,
    unlinkedCount: 0,
  };

  // Store summary for each tab separately
  const [dailyMarketSummary, setDailyMarketSummary] = useState<PaymentSummaryData>(
    initialData?.summaryData || emptySummary
  );
  const [contractWeeklySummary, setContractWeeklySummary] = useState<PaymentSummaryData>(emptySummary);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Display the active tab's summary
  const summaryData = activeTab === 0 ? dailyMarketSummary : contractWeeklySummary;

  // Callbacks for child components to update their summaries
  const handleDailyMarketSummaryChange = useCallback((summary: PaymentSummaryData) => {
    setDailyMarketSummary(summary);
  }, []);

  const handleContractWeeklySummaryChange = useCallback((summary: PaymentSummaryData) => {
    setContractWeeklySummary(summary);
  }, []);

  // Handle data changes - child components handle their own data fetching
  const handleDataChange = useCallback(() => {
    // Summary updates are now handled by onSummaryChange callbacks
  }, []);

  // Calculate effective date range for tab components
  const effectiveDateFrom = isAllTime
    ? "2000-01-01"
    : dateFrom || dayjs().format("YYYY-MM-DD");
  const effectiveDateTo = dateTo || dayjs().format("YYYY-MM-DD");

  // If no site selected, show message
  if (!selectedSite) {
    return (
      <Box>
        <PageHeader
          title="Salary Settlements"
          subtitle="Manage daily, market, and contract laborer salary settlements"
        />
        <Alert severity="info">
          Please select a site from the dropdown to view salary settlements.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Salary Settlements"
        subtitle="Manage daily, market, and contract laborer salary settlements"
      />

      {!isAllTime && (
        <Paper sx={{ mb: 2, overflow: "hidden" }}>
          <ScopePill />
        </Paper>
      )}

      {/* Back button when coming from expenses page via ref code click */}
      {highlightRef && (
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={() => router.push("/site/expenses")}
          >
            Back to Expenses
          </Button>
        </Box>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => {
            setActiveTab(newValue);
            // Update URL to preserve tab on refresh
            const tabName = newValue === 0 ? "salary" : "contract";
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", tabName);
            router.replace(`/site/payments?${params.toString()}`, { scroll: false });
          }}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab
            icon={<PersonIcon />}
            iconPosition="start"
            label="Daily & Market Settlements"
            id="payment-tab-0"
            aria-controls="payment-tabpanel-0"
          />
          <Tab
            icon={<GroupsIcon />}
            iconPosition="start"
            label="Contract Weekly Settlements"
            id="payment-tab-1"
            aria-controls="payment-tabpanel-1"
          />
        </Tabs>

        <Box sx={{ p: 2 }}>
          <TabPanel value={activeTab} index={0}>
            <DailyMarketPaymentsTab
              dateFrom={effectiveDateFrom}
              dateTo={effectiveDateTo}
              onFilterChange={() => {}}
              onDataChange={handleDataChange}
              onSummaryChange={handleDailyMarketSummaryChange}
              highlightRef={highlightRef}
            />
          </TabPanel>

          <TabPanel value={activeTab} index={1}>
            <ContractWeeklyPaymentsTab
              dateFrom={effectiveDateFrom}
              dateTo={effectiveDateTo}
              onDataChange={handleDataChange}
              onSummaryChange={handleContractWeeklySummaryChange}
              highlightRef={highlightRef}
            />
          </TabPanel>
        </Box>
      </Paper>

      {/* Notification snackbar (from redirect) */}
      <Snackbar
        open={!!notificationMessage}
        autoHideDuration={8000}
        onClose={() => setNotificationMessage(null)}
        message={notificationMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
