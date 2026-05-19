"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type EstimateItem = {
  id: string; // local UUID (crypto.randomUUID())
  materialId: string | null; // null for ad-hoc items not in catalog
  materialName: string;
  categoryCode: string;
  inputs: Record<string, number>;
  units: Record<string, string>;
  computedOutput: number; // e.g. 4.375 (cft)
  outputUnit: string; // e.g. 'cft'
  outputLabel: string; // e.g. 'Gana adi (cft)'
  /** Composite brand id resolved from quality (+ Palagai width) — used when converting to MR. */
  brandId: string | null;
  pricingDimensionValue: string | null; // e.g. '2nd Quality' or brand name
  vendorQuotes: {
    vendorId: string;
    vendorName: string;
    unitPrice: number;
    subtotal: number;
  }[];
  selectedVendorId: string | null;
};

interface EstimateBasketContextType {
  items: EstimateItem[];
  addItem: (item: Omit<EstimateItem, "id">) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<Omit<EstimateItem, 'id'>>) => void;
  clearBasket: () => void;
  /** Replace the current basket with the given items (used by load-draft). */
  loadItems: (items: EstimateItem[]) => void;
  totalItems: number;
}

const EstimateBasketContext = createContext<
  EstimateBasketContextType | undefined
>(undefined);

export function EstimateBasketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<EstimateItem[]>([]);

  const addItem = useCallback((item: Omit<EstimateItem, "id">) => {
    const newItem: EstimateItem = {
      ...item,
      id: crypto.randomUUID(),
    };
    setItems((prev) => [...prev, newItem]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateItem = useCallback(
    (id: string, patch: Partial<Omit<EstimateItem, 'id'>>) => {
      setItems((prev) => {
        if (process.env.NODE_ENV !== 'production' && !prev.some((item) => item.id === id)) {
          console.warn(`[EstimateBasket] updateItem: no item with id "${id}"`);
        }
        return prev.map((item) => (item.id === id ? { ...item, ...patch } : item));
      });
    },
    []
  );

  const clearBasket = useCallback(() => {
    setItems([]);
  }, []);

  const loadItems = useCallback((next: EstimateItem[]) => {
    // Loaded drafts may have stale or duplicate client ids; remint to be safe.
    setItems(
      next.map((item) => ({ ...item, id: crypto.randomUUID() })),
    );
  }, []);

  const value = useMemo<EstimateBasketContextType>(
    () => ({
      items,
      addItem,
      removeItem,
      updateItem,
      clearBasket,
      loadItems,
      totalItems: items.length,
    }),
    [items, addItem, removeItem, updateItem, clearBasket, loadItems]
  );

  return (
    <EstimateBasketContext.Provider value={value}>
      {children}
    </EstimateBasketContext.Provider>
  );
}

export function useEstimateBasket(): EstimateBasketContextType {
  const ctx = useContext(EstimateBasketContext);
  if (ctx === undefined) {
    throw new Error(
      "useEstimateBasket must be used within an EstimateBasketProvider"
    );
  }
  return ctx;
}
