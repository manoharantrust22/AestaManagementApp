"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Box, Typography, Alert, Button, CircularProgress } from "@mui/material";
import { LocalCafe as CafeIcon, ArrowBack as BackIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useTeaShopForSite } from "@/hooks/queries/useCompanyTeaShops";
import TeaShopEntryDialog from "@/components/tea-shop/TeaShopEntryDialog";
import type { Database } from "@/types/database.types";

type TeaShopAccount = Database["public"]["Tables"]["tea_shop_accounts"]["Row"];

/**
 * Dedicated, mobile-first "log tea" surface — reached from /site/today, so the
 * engineer never has to dig through the attendance sheet. It resolves the site's
 * tea shop and opens the same contract-aware entry dialog (one shared save path).
 */
export default function QuickTeaEntryPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id;

  const { data: companyTeaShop, isLoading: loadingCompany } = useTeaShopForSite(siteId);

  const { data: shopAccount, isLoading: loadingShop } = useQuery({
    queryKey: ["tea-shop-account", siteId],
    enabled: !!siteId,
    queryFn: async (): Promise<TeaShopAccount | null> => {
      const { data } = await (supabase.from("tea_shop_accounts") as any)
        .select("*")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .maybeSingle();
      return (data as TeaShopAccount | null) ?? null;
    },
  });

  const effectiveShop = useMemo<TeaShopAccount | null>(() => {
    if (shopAccount) return shopAccount;
    if (companyTeaShop && selectedSite) {
      return {
        id: companyTeaShop.id,
        site_id: selectedSite.id,
        shop_name: companyTeaShop.name,
        owner_name: companyTeaShop.owner_name,
        contact_phone: companyTeaShop.contact_phone,
        address: companyTeaShop.address,
        upi_id: (companyTeaShop as any).upi_id ?? null,
        qr_code_url: (companyTeaShop as any).qr_code_url ?? null,
        notes: companyTeaShop.notes,
        is_active: companyTeaShop.is_active,
        is_group_shop: false,
        site_group_id: null,
        created_at: companyTeaShop.created_at,
        updated_at: companyTeaShop.updated_at,
      } as unknown as TeaShopAccount;
    }
    return null;
  }, [shopAccount, companyTeaShop, selectedSite]);

  const goBack = () => router.push("/site/today");
  const loading = loadingCompany || loadingShop;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box sx={{ p: 2.5, pt: 3 }}>
        <Button startIcon={<BackIcon />} onClick={goBack} size="small" sx={{ mb: 1 }}>
          Back
        </Button>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CafeIcon color="primary" />
          <Typography variant="h5" fontWeight={600}>
            Log tea / snacks
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {selectedSite?.name || "Pick a site first"}
        </Typography>

        {!siteId && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Pick a site from the menu to log tea.
          </Alert>
        )}

        {siteId && loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {siteId && !loading && !effectiveShop && (
          <Alert severity="info" sx={{ mt: 2 }}>
            No tea shop is set up for this site yet. Set one up from the Tea Shop page.
            <Box sx={{ mt: 1 }}>
              <Button variant="outlined" size="small" onClick={() => router.push("/site/tea-shop")}>
                Open Tea Shop
              </Button>
            </Box>
          </Alert>
        )}
      </Box>

      {effectiveShop && (
        <TeaShopEntryDialog
          open
          onClose={goBack}
          shop={effectiveShop}
          initialDate={dayjs().format("YYYY-MM-DD")}
          onSuccess={() => router.push("/site/tea-shop")}
        />
      )}
    </Box>
  );
}
