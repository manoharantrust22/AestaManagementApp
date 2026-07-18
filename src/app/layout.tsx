import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeProvider from "@/components/providers/ThemeProvider";
import { SessionErrorHandler } from "@/components/providers/SessionErrorHandler";
import { AuthProvider } from "@/contexts/AuthContext";
import { SiteProvider } from "@/contexts/SiteContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { ToastProvider } from "@/contexts/ToastContext";
import QueryProvider from "@/providers/QueryProvider";
import { TabProvider } from "@/providers/TabProvider";
import { PWAProvider } from "@/components/pwa";


export const metadata: Metadata = {
  title: "Aesta Construction Manager",
  description: "Construction Labor Management System",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aesta",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1976d2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <PWAProvider>
          <TabProvider>
            <AuthProvider>
              <SessionErrorHandler>
                <CompanyProvider>
                  <SiteProvider>
                  <DateRangeProvider>
                    <QueryProvider>
                      <ToastProvider>
                        {children}
                      </ToastProvider>
                    </QueryProvider>
                  </DateRangeProvider>
                </SiteProvider>
                </CompanyProvider>
              </SessionErrorHandler>
            </AuthProvider>
          </TabProvider>
          </PWAProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
