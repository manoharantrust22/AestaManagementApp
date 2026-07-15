import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

/**
 * Categorized "where the money went" rollup for one subcontract node (a section
 * or contract) INCLUDING its attached fixed-price packages.
 *
 * Only `labor` participates in the paid-vs-agreed balance the workspace shows;
 * materials / rentals / other are linked spend that must be visible on the
 * section but must never make a labor contract read "overpaid".
 */
export interface SectionSpendBreakdown {
  labor: {
    /** subcontract_payments recorded directly on this node. */
    contractPayments: number;
    /** settlement_groups classified to this node via subcontract_id. */
    salarySettlements: number;
    /** Per-laborer settlements linked via contract_ref_kind='subcontract'. */
    contractWages: number;
    /** Per-laborer crew settlements on the attached packages. */
    packageCrewWages: number;
    /** Lump task_work_payments on the attached packages. */
    packagePayments: number;
    total: number;
  };
  materials: {
    /** material_purchase_expenses linked to this node. */
    purchases: number;
    /** misc_expenses in a Material* category. */
    misc: number;
    total: number;
  };
  rentals: {
    /** rental_settlements linked to this node. */
    settlements: number;
    /** misc_expenses in the Rental Settlement category. */
    misc: number;
    total: number;
  };
  other: {
    /** tea_shop_settlements linked to this node. */
    teaShop: number;
    /** Every other misc_expenses category (General Expense, Tea & Snacks…). */
    misc: number;
    total: number;
  };
  /** materials + rentals + other — spend that does NOT count into the balance. */
  otherSpendTotal: number;
  /** labor + otherSpendTotal. */
  grandTotal: number;
}

/**
 * Buckets a misc_expenses category name (expense_categories.name) into the
 * breakdown group it belongs to. Pure so it can be unit-tested.
 */
export function bucketMiscCategory(
  name: string | null | undefined
): "materials" | "rentals" | "other" {
  const n = (name ?? "").trim().toLowerCase();
  if (n.startsWith("material")) return "materials";
  if (n.startsWith("rental")) return "rentals";
  return "other";
}

const num = (v: unknown): number => Number(v ?? 0) || 0;

export function useSectionSpendBreakdown(
  sectionId: string | undefined,
  packageIds: string[]
) {
  const supabase = createClient();
  const idsKey = [...packageIds].sort().join("|");
  return useQuery({
    queryKey: ["section-spend", sectionId, idsKey],
    enabled: !!sectionId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(async (): Promise<SectionSpendBreakdown> => {
      const sb = supabase as any;
      const pkgIds = [...packageIds];

      // Salary settlements can be linked to this node two ways (subcontract_id
      // or contract_ref); the same group must count exactly once, so all three
      // settlement queries merge into one per-group map below.
      const sgFlags = (q: any) =>
        q.eq("is_cancelled", false).is("transferred_out_at", null);

      const [
        paymentsRes,
        sgLinkedRes,
        sgContractRefRes,
        sgPackageRes,
        pkgPaymentsRes,
        materialRes,
        miscRes,
        rentalRes,
        teaRes,
      ] = await Promise.all([
        sb
          .from("subcontract_payments")
          .select("id, amount")
          .eq("contract_id", sectionId)
          .eq("is_deleted", false),
        sgFlags(
          sb
            .from("settlement_groups")
            .select("id, total_amount")
            .eq("subcontract_id", sectionId)
        ),
        sgFlags(
          sb
            .from("settlement_groups")
            .select("id, total_amount")
            .eq("contract_ref_kind", "subcontract")
            .eq("contract_ref_id", sectionId)
            .eq("payment_type", "salary")
        ),
        pkgIds.length
          ? sgFlags(
              sb
                .from("settlement_groups")
                .select("id, total_amount")
                .eq("contract_ref_kind", "task_work")
                .in("contract_ref_id", pkgIds)
                .eq("payment_type", "salary")
            )
          : Promise.resolve({ data: [], error: null }),
        pkgIds.length
          ? sb
              .from("task_work_payments")
              .select("id, amount")
              .in("package_id", pkgIds)
              .eq("is_deleted", false)
          : Promise.resolve({ data: [], error: null }),
        sb
          .from("material_purchase_expenses")
          .select(
            "id, amount_paid, total_amount, purchase_type, settlement_reference, is_paid"
          )
          .eq("subcontract_id", sectionId)
          .eq("is_paid", true)
          .or("purchase_type.neq.group_stock,settlement_reference.not.is.null"),
        sb
          .from("misc_expenses")
          .select("id, amount, category:expense_categories(name)")
          .eq("subcontract_id", sectionId)
          .eq("is_cancelled", false),
        sb
          .from("rental_settlements")
          .select(
            "id, negotiated_final_amount, balance_amount, total_advance_paid"
          )
          .eq("subcontract_id", sectionId),
        sb
          .from("tea_shop_settlements")
          .select("id, amount_paid")
          .eq("subcontract_id", sectionId)
          .eq("is_cancelled", false),
      ]);

      for (const res of [
        paymentsRes,
        sgLinkedRes,
        sgContractRefRes,
        sgPackageRes,
        pkgPaymentsRes,
        materialRes,
        miscRes,
        rentalRes,
        teaRes,
      ]) {
        if (res.error) throw res.error;
      }

      const contractPayments = (paymentsRes.data ?? []).reduce(
        (s: number, r: any) => s + num(r.amount),
        0
      );

      // First bucket to claim a settlement group wins; a group linked both ways
      // (subcontract_id AND contract_ref) counts only once.
      const seen = new Map<string, "salary" | "wages" | "crew">();
      for (const r of sgLinkedRes.data ?? []) {
        if (!seen.has(r.id)) seen.set(r.id, "salary");
      }
      for (const r of sgContractRefRes.data ?? []) {
        if (!seen.has(r.id)) seen.set(r.id, "wages");
      }
      for (const r of sgPackageRes.data ?? []) {
        if (!seen.has(r.id)) seen.set(r.id, "crew");
      }
      const amounts = new Map<string, number>();
      for (const r of [
        ...(sgLinkedRes.data ?? []),
        ...(sgContractRefRes.data ?? []),
        ...(sgPackageRes.data ?? []),
      ]) {
        amounts.set(r.id, num(r.total_amount));
      }
      let salarySettlements = 0;
      let contractWages = 0;
      let packageCrewWages = 0;
      for (const [id, bucket] of seen) {
        const amt = amounts.get(id) ?? 0;
        if (bucket === "salary") salarySettlements += amt;
        else if (bucket === "wages") contractWages += amt;
        else packageCrewWages += amt;
      }

      const packagePayments = (pkgPaymentsRes.data ?? []).reduce(
        (s: number, r: any) => s + num(r.amount),
        0
      );

      const materialPurchases = (materialRes.data ?? []).reduce(
        (s: number, r: any) => s + num(r.amount_paid ?? r.total_amount),
        0
      );

      let materialsMisc = 0;
      let rentalsMisc = 0;
      let otherMisc = 0;
      for (const r of miscRes.data ?? []) {
        const bucket = bucketMiscCategory(r.category?.name);
        const amt = num(r.amount);
        if (bucket === "materials") materialsMisc += amt;
        else if (bucket === "rentals") rentalsMisc += amt;
        else otherMisc += amt;
      }

      // Same paid-amount rule as v_all_expenses' rental leg:
      // negotiated final, else balance + advances.
      const rentalSettlements = (rentalRes.data ?? []).reduce(
        (s: number, r: any) =>
          s +
          num(
            r.negotiated_final_amount ??
              num(r.balance_amount) + num(r.total_advance_paid)
          ),
        0
      );

      const teaShop = (teaRes.data ?? []).reduce(
        (s: number, r: any) => s + num(r.amount_paid),
        0
      );

      const labor = {
        contractPayments,
        salarySettlements,
        contractWages,
        packageCrewWages,
        packagePayments,
        total:
          contractPayments +
          salarySettlements +
          contractWages +
          packageCrewWages +
          packagePayments,
      };
      const materials = {
        purchases: materialPurchases,
        misc: materialsMisc,
        total: materialPurchases + materialsMisc,
      };
      const rentals = {
        settlements: rentalSettlements,
        misc: rentalsMisc,
        total: rentalSettlements + rentalsMisc,
      };
      const other = {
        teaShop,
        misc: otherMisc,
        total: teaShop + otherMisc,
      };
      const otherSpendTotal = materials.total + rentals.total + other.total;

      return {
        labor,
        materials,
        rentals,
        other,
        otherSpendTotal,
        grandTotal: labor.total + otherSpendTotal,
      };
    }, { operationName: "useSectionSpendBreakdown" }),
  });
}
