/**
 * Formatting utilities for the application
 */

/**
 * Format amount as Indian Rupees
 * Shows lakhs (L) for amounts >= 1 lakh
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "₹0";

  if (Math.abs(amount) >= 100000) {
    return `₹${(amount / 100000).toFixed(2)}L`;
  }

  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format amount as Indian Rupees (full format)
 * Always shows full amount without abbreviation
 */
export function formatCurrencyFull(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "₹0";

  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format date as DD MMM YYYY (e.g., 15 Dec 2024)
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";

  const d = typeof date === "string" ? new Date(date) : date;

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format date as DD/MM/YYYY
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return "-";

  const d = typeof date === "string" ? new Date(date) : date;

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Format date and time
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "-";

  const d = typeof date === "string" ? new Date(date) : date;

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format time as HH:MM AM/PM
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "-";

  const d = typeof date === "string" ? new Date(date) : date;

  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "-";

  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (Math.abs(diffMins) < 60) {
    if (diffMins === 0) return "just now";
    return diffMins > 0
      ? `in ${diffMins} min${diffMins === 1 ? "" : "s"}`
      : `${Math.abs(diffMins)} min${Math.abs(diffMins) === 1 ? "" : "s"} ago`;
  }

  if (Math.abs(diffHours) < 24) {
    return diffHours > 0
      ? `in ${diffHours} hour${diffHours === 1 ? "" : "s"}`
      : `${Math.abs(diffHours)} hour${Math.abs(diffHours) === 1 ? "" : "s"} ago`;
  }

  if (Math.abs(diffDays) <= 30) {
    return diffDays > 0
      ? `in ${diffDays} day${diffDays === 1 ? "" : "s"}`
      : `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`;
  }

  return formatDate(d);
}

/**
 * Format number with Indian numbering system (lakhs, crores)
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "0";

  return num.toLocaleString("en-IN");
}

/**
 * Format percentage
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value === null || value === undefined) return "0%";

  return `${value.toFixed(decimals)}%`;
}

/**
 * Format phone number for display
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";

  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");

  // Format as +91 XXXXX XXXXX for Indian numbers
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }

  return phone;
}

/**
 * Format quantity with unit
 */
export function formatQuantity(
  quantity: number | null | undefined,
  unit: string
): string {
  if (quantity === null || quantity === undefined) return "-";

  return `${quantity.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${unit}`;
}

/**
 * Clean phone number to digits only (for WhatsApp URL)
 */
export function cleanPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";

  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");

  // If 10 digits, add India country code
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // If already has country code
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }

  return digits;
}

/**
 * Generate WhatsApp URL with pre-filled message
 * Opens WhatsApp with the specified phone number and message
 */
export function generateWhatsAppUrl(
  phone: string | null | undefined,
  message: string
): string {
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) return "";

  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanedPhone}?text=${encodedMessage}`;
}

/**
 * Generate payment reminder message for engineer
 */
export function generatePaymentReminderMessage(params: {
  engineerName: string;
  paymentDate: string;
  amount: number;
  laborerCount: number;
  siteName: string;
}): string {
  const { engineerName, paymentDate, amount, laborerCount, siteName } = params;

  return `Hi ${engineerName},

This is a reminder to complete the following payment:

📅 Date: ${paymentDate}
💰 Amount: Rs.${amount.toLocaleString("en-IN")}
👷 Laborers: ${laborerCount} ${laborerCount === 1 ? "laborer" : "laborers"}
📍 Site: ${siteName}

Please settle this payment and upload proof.

Thank you!`;
}

/**
 * Generate payment settlement notification message with deep link for engineer
 */
export function generateSettlementNotificationMessage(params: {
  engineerName: string;
  amount: number;
  dailyCount: number;
  marketCount: number;
  siteName: string;
  transactionId: string;
  appBaseUrl?: string;
}): string {
  const {
    engineerName,
    amount,
    dailyCount,
    marketCount,
    siteName,
    transactionId,
    appBaseUrl = "https://app.aesta.co.in",
  } = params;

  const laborerText =
    dailyCount + marketCount > 0
      ? `${dailyCount + marketCount} laborers (${dailyCount} daily, ${marketCount} market)`
      : "laborers";

  const deepLink = `${appBaseUrl}/site/my-wallet?settle=${transactionId}`;

  return `*Aesta: Payment Received*

Hi ${engineerName},

You have received payment for settlement:

💰 Amount: Rs.${amount.toLocaleString("en-IN")}
👷 Laborers: ${laborerText}
📍 Site: ${siteName}

Click below to settle:
${deepLink}

Please complete the settlement by paying the laborers and uploading proof.`;
}
