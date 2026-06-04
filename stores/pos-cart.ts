"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ParkedSale, PosCartItem, Product, SaleDiscount } from "@/types";

interface PosCartState {
  items: PosCartItem[];
  parkedSales: ParkedSale[];
  discount: SaleDiscount | null;
  addProduct: (product: Product) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeProduct: (productId: string) => void;
  clearCart: () => void;
  setDiscount: (discount: SaleDiscount | null) => void;
  parkCart: (label?: string) => void;
  resumeParkedSale: (id: string) => void;
  deleteParkedSale: (id: string) => void;
}

export const usePosCart = create<PosCartState>()(
  persist(
    (set) => ({
      items: [],
      parkedSales: [],
      discount: null,
      addProduct: (product) =>
        set((state) => {
          const existing = state.items.find((item) => item.product_id === product.id);

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.product_id === product.id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item,
              ),
            };
          }

          return {
            items: [
              ...state.items,
              {
                product_id: product.id,
                product_name_snapshot: product.name_brand || product.name_generic,
                product_generic_snapshot: product.name_generic,
                barcode_snapshot: product.barcode_primary,
                quantity: 1,
              },
            ],
          };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((item) => item.product_id !== productId)
              : state.items.map((item) =>
                  item.product_id === productId ? { ...item, quantity } : item,
                ),
        })),
      removeProduct: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.product_id !== productId),
        })),
      clearCart: () => set({ items: [], discount: null }),
      setDiscount: (discount) => set({ discount }),
      parkCart: (label) =>
        set((state) => {
          if (state.items.length === 0) {
            return state;
          }

          const parkedSale: ParkedSale = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: label?.trim() || `Parked sale ${state.parkedSales.length + 1}`,
            parked_at: new Date().toISOString(),
            items: state.items,
            discount: state.discount,
          };

          return {
            items: [],
            discount: null,
            parkedSales: [parkedSale, ...state.parkedSales],
          };
        }),
      resumeParkedSale: (id) =>
        set((state) => {
          const parkedSale = state.parkedSales.find((sale) => sale.id === id);

          if (!parkedSale) {
            return state;
          }

          return {
            items: parkedSale.items,
            discount: parkedSale.discount ?? null,
            parkedSales: state.parkedSales.filter((sale) => sale.id !== id),
          };
        }),
      deleteParkedSale: (id) =>
        set((state) => ({
          parkedSales: state.parkedSales.filter((sale) => sale.id !== id),
        })),
    }),
    {
      name: "pharmpos-pos-cart",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
