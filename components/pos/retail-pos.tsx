"use client";

import {
  Banknote,
  Boxes,
  CreditCard,
  Minus,
  PackageOpen,
  Pause,
  Play,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { checkoutRetailSale, getSaleReceipt, subscribeRecentRetailSales } from "@/lib/services/sales.service";
import { subscribeBatches, subscribeProducts } from "@/lib/services/inventory.service";
import { allocateFefoStock } from "@/lib/utils/fefo";
import { usePosCart } from "@/stores/pos-cart";
import { ReceiptModal } from "@/components/pos/receipt-modal";
import type { Batch, PaymentMethod, Product, ReceiptData, SaleTransaction } from "@/types";

const currency = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
});
const number = new Intl.NumberFormat("en-GH");
const timeFormat = new Intl.DateTimeFormat("en-GH", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "short",
});

function toDate(value: SaleTransaction["sale_date"]) {
  if (!value) return new Date();
  return typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
}

export function RetailPos() {
  const { user, appUser, role } = useAuth();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [online, setOnline] = useState(true);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [recentSales, setRecentSales] = useState<SaleTransaction[]>([]);
  const [fetchingReceipt, setFetchingReceipt] = useState<string | null>(null);
  const {
    items,
    parkedSales,
    addProduct,
    setQuantity,
    removeProduct,
    clearCart,
    parkCart,
    resumeParkedSale,
    deleteParkedSale,
  } = usePosCart();

  useEffect(() => {
    const updateOnlineState = () => setOnline(navigator.onLine);
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    const unsubscribes: Array<() => void> = [];
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const handleError = (message: string) => {
      setLoadError(message);
      toast({ title: "Could not load POS stock", description: message, variant: "error" });
    };

    try {
      unsubscribes.push(
        subscribeProducts(
          (nextProducts) => {
            setProducts(nextProducts);
            setProductsLoading(false);
          },
          () => {
            setProductsLoading(false);
            handleError("Products could not be loaded. Check Firestore access.");
          },
        ),
        subscribeBatches(
          (nextBatches) => {
            setBatches(nextBatches);
            setBatchesLoading(false);
          },
          () => {
            setBatchesLoading(false);
            handleError("Batch stock could not be loaded. Check Firestore access.");
          },
        ),
        subscribeRecentRetailSales(
          (sales) => setRecentSales(sales),
          () => {},
        ),
      );
    } catch {
      fallbackTimer = setTimeout(() => {
        const message = "Add Firebase credentials to .env.local to connect the POS.";
        setProductsLoading(false);
        setBatchesLoading(false);
        setLoadError(message);
        toast({ title: "Firebase is not configured", description: message, variant: "error" });
      }, 0);
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
    };
  }, [toast]);

  const activeProducts = useMemo(
    () => products.filter((product) => product.is_active),
    [products],
  );
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return activeProducts
      .filter(
        (product) =>
          !term ||
          product.name_brand.toLowerCase().includes(term) ||
          product.name_generic.toLowerCase().includes(term) ||
          product.barcode_primary.toLowerCase().includes(term) ||
          product.barcode_internal?.toLowerCase().includes(term),
      )
      .slice(0, 30);
  }, [activeProducts, search]);

  const cartLines = useMemo(
    () =>
      items.map((item) => {
        const allocation = allocateFefoStock(
          batches.filter((batch) => batch.product_id === item.product_id),
          item.quantity,
        );
        const lineTotal = allocation.allocations.reduce(
          (total, allocated) => total + allocated.quantity * allocated.batch.retail_price,
          0,
        );

        return { ...item, allocation, lineTotal };
      }),
    [batches, items],
  );
  const estimatedTotal = cartLines.reduce((total, line) => total + line.lineTotal, 0);
  const totalUnits = items.reduce((total, item) => total + item.quantity, 0);
  const stockReady = cartLines.every((line) => line.allocation.fulfilled);
  const loading = productsLoading || batchesLoading;

  function productStock(productId: string) {
    return allocateFefoStock(
      batches.filter((batch) => batch.product_id === productId),
      1,
    );
  }

  function handleAddProduct(product: Product) {
    const stock = productStock(product.id);
    const currentQuantity =
      items.find((item) => item.product_id === product.id)?.quantity ?? 0;

    if (stock.available <= currentQuantity) {
      toast({
        title: "No more sellable stock",
        description: `${product.name_brand} has ${stock.available} units available.`,
        variant: "error",
      });
      return;
    }

    addProduct(product);
    setSearch("");
    searchRef.current?.focus();
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim().toLowerCase();
    const barcodeMatch = activeProducts.find(
      (product) =>
        product.barcode_primary.toLowerCase() === term ||
        product.barcode_internal?.toLowerCase() === term,
    );
    const product = barcodeMatch ?? (visibleProducts.length === 1 ? visibleProducts[0] : null);

    if (product) {
      handleAddProduct(product);
      return;
    }

    toast({
      title: term ? "Select a matching product" : "Scan or search for a product",
      description: term
        ? `${visibleProducts.length} products match the current search.`
        : "Enter a barcode, brand, or generic name.",
      variant: "info",
    });
  }

  function changeQuantity(productId: string, nextQuantity: number, available: number) {
    if (nextQuantity > available) {
      toast({
        title: "Insufficient stock",
        description: `Only ${available} sellable units are available.`,
        variant: "error",
      });
      return;
    }
    setQuantity(productId, nextQuantity);
  }

  function handleParkSale() {
    if (items.length === 0) {
      return;
    }
    parkCart();
    setCashReceived("");
    toast({ title: "Sale parked", description: "The cart was saved on this device.", variant: "success" });
  }

  async function handleCheckout() {
    if (!user || !appUser || !role) {
      toast({
        title: "Checkout unavailable",
        description: "Your user profile and role are required.",
        variant: "error",
      });
      return;
    }

    if (!online) {
      toast({
        title: "Checkout requires a connection",
        description: "Reconnect before deducting stock and completing the sale.",
        variant: "error",
      });
      return;
    }

    setCheckingOut(true);
    try {
      const result = await checkoutRetailSale(
        {
          items,
          batches,
          payment_method: paymentMethod,
          amount_tendered: paymentMethod === "cash" ? Number(cashReceived) : undefined,
        },
        { uid: user.uid, name: appUser.name, role },
      );
      clearCart();
      setCashReceived("");
      setReceiptData(result.receipt);
      searchRef.current?.focus();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const message = rawMessage.includes("available") || rawMessage.includes("total")
        ? rawMessage
        : rawMessage.includes("offline")
          ? "Checkout could not complete because Firestore is offline."
          : "Checkout could not complete. Refresh stock and check Firebase permissions.";
      toast({ title: "Sale not completed", description: message, variant: "error" });
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleReprintSale(saleId: string) {
    setFetchingReceipt(saleId);
    try {
      const receipt = await getSaleReceipt(saleId);
      if (receipt) {
        setReceiptData(receipt);
      } else {
        toast({ title: "Receipt not found", description: "The sale record could not be loaded.", variant: "error" });
      }
    } catch {
      toast({ title: "Could not load receipt", description: "Check your connection and try again.", variant: "error" });
    } finally {
      setFetchingReceipt(null);
    }
  }

  return (
    <div className="space-y-5">
      {receiptData ? (
        <ReceiptModal receipt={receiptData} onClose={() => setReceiptData(null)} />
      ) : null}

      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Retail workflow</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Point of Sale</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Scan or search products, allocate FEFO stock, and complete an atomic retail sale.
          </p>
        </div>
        <div
          className={`flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium ${
            online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {online ? "Online checkout ready" : "Checkout offline"}
        </div>
      </header>

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)]">
        <div className="space-y-4">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-zinc-400" />
            <input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Scan barcode or search product, then press Enter"
              className="h-12 w-full rounded-md border border-zinc-300 bg-white pl-12 pr-4 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            />
          </form>

          <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-emerald-900/10 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-emerald-950">Products</h2>
                <p className="mt-1 text-xs text-zinc-500">Retail and shared FEFO stock</p>
              </div>
              <p className="text-xs text-zinc-500">{visibleProducts.length} shown</p>
            </header>
            <div className="grid max-h-[620px] gap-2 overflow-y-auto p-3 sm:grid-cols-2">
              {loading ? <ProductCardsSkeleton /> : null}
              {!loading
                ? visibleProducts.map((product) => {
                    const stock = productStock(product.id);
                    const nextBatch = stock.allocations[0]?.batch;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleAddProduct(product)}
                        disabled={stock.available === 0}
                        className="rounded-md border border-zinc-200 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-emerald-950">{product.name_brand}</p>
                            <p className="mt-1 text-xs text-zinc-500">{product.name_generic}</p>
                          </div>
                          <Plus className="h-4 w-4 shrink-0 text-emerald-700" />
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="font-mono text-[11px] text-zinc-500">
                              {product.barcode_primary}
                            </p>
                            <p className="mt-1 text-xs text-zinc-600">
                              {number.format(stock.available)} available
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-emerald-800">
                            {nextBatch ? currency.format(nextBatch.retail_price) : "No stock"}
                          </p>
                        </div>
                      </button>
                    );
                  })
                : null}
            </div>
            {!loading && visibleProducts.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
                <PackageOpen className="h-8 w-8 text-lime-600" />
                <p className="mt-3 text-sm font-semibold text-emerald-950">No products found</p>
                <p className="mt-1 text-sm text-zinc-500">Adjust the search or add inventory stock.</p>
              </div>
            ) : null}
          </section>

          {parkedSales.length > 0 ? (
            <section className="rounded-md border border-emerald-900/10 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-emerald-950">Parked sales</h2>
                  <p className="mt-1 text-xs text-zinc-500">Saved locally on this device</p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                  {parkedSales.length}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {parkedSales.map((sale) => (
                  <div key={sale.id} className="rounded-md border border-zinc-200 p-3">
                    <p className="text-sm font-medium text-emerald-950">{sale.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {sale.items.reduce((sum, item) => sum + item.quantity, 0)} units |{" "}
                      {new Date(sale.parked_at).toLocaleString("en-GH")}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={items.length > 0}
                        onClick={() => resumeParkedSale(sale.id)}
                        className="flex h-8 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Resume
                      </button>
                      <button
                        type="button"
                        title="Delete parked sale"
                        onClick={() => deleteParkedSale(sale.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {recentSales.length > 0 ? (
            <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-emerald-900/10 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-emerald-950">Recent sales</h2>
                  <p className="mt-1 text-xs text-zinc-500">Last {recentSales.length} completed retail transactions</p>
                </div>
              </header>
              <div className="divide-y divide-zinc-100">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-zinc-400">
                        {sale.id.slice(-10).toUpperCase()}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {timeFormat.format(toDate(sale.sale_date))} · {sale.item_count} item{sale.item_count === 1 ? "" : "s"} · {PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-sm font-semibold text-emerald-950">
                        {currency.format(sale.total)}
                      </p>
                      <button
                        type="button"
                        title="View receipt"
                        disabled={fetchingReceipt === sale.id}
                        onClick={() => handleReprintSale(sale.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-emerald-700 disabled:opacity-50"
                      >
                        <Receipt className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="h-fit rounded-md border border-emerald-900/10 bg-white shadow-sm xl:sticky xl:top-6">
          <header className="flex items-center justify-between border-b border-emerald-900/10 px-4 py-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-700" />
              <div>
                <h2 className="text-sm font-semibold text-emerald-950">Current sale</h2>
                <p className="mt-0.5 text-xs text-zinc-500">{totalUnits} units</p>
              </div>
            </div>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Clear
              </button>
            ) : null}
          </header>

          <div className="max-h-[390px] divide-y divide-zinc-100 overflow-y-auto">
            {cartLines.map((line) => (
              <div key={line.product_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-emerald-950">
                      {line.product_name_snapshot}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {line.allocation.fulfilled
                        ? `${line.allocation.allocations.length} FEFO batch${line.allocation.allocations.length === 1 ? "" : "es"}`
                        : `Only ${line.allocation.available} available`}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Remove product"
                    onClick={() => removeProduct(line.product_id)}
                    className="text-zinc-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center rounded-md border border-zinc-200">
                    <button
                      type="button"
                      title="Decrease quantity"
                      onClick={() =>
                        changeQuantity(line.product_id, line.quantity - 1, line.allocation.available)
                      }
                      className="flex h-8 w-8 items-center justify-center hover:bg-zinc-50"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      aria-label={`${line.product_name_snapshot} quantity`}
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(event) =>
                        changeQuantity(
                          line.product_id,
                          Math.max(1, Number(event.target.value) || 1),
                          line.allocation.available,
                        )
                      }
                      className="h-8 w-12 border-x border-zinc-200 text-center text-sm outline-none"
                    />
                    <button
                      type="button"
                      title="Increase quantity"
                      onClick={() =>
                        changeQuantity(line.product_id, line.quantity + 1, line.allocation.available)
                      }
                      className="flex h-8 w-8 items-center justify-center hover:bg-zinc-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-emerald-950">
                    {currency.format(line.lineTotal)}
                  </p>
                </div>
                {!line.allocation.fulfilled ? (
                  <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                    Reduce quantity before checkout.
                  </p>
                ) : null}
              </div>
            ))}

            {items.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
                <Boxes className="h-8 w-8 text-lime-600" />
                <p className="mt-3 text-sm font-semibold text-emerald-950">Cart is empty</p>
                <p className="mt-1 max-w-xs text-sm text-zinc-500">
                  Scan a barcode or select a product to begin.
                </p>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 border-t border-emerald-900/10 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-600">Estimated total</p>
              <p className="text-xl font-semibold text-emerald-950">
                {currency.format(estimatedTotal)}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Payment method</p>
              <div className="grid grid-cols-3 gap-2">
                <PaymentButton
                  active={paymentMethod === "cash"}
                  label="Cash"
                  icon={Banknote}
                  onClick={() => setPaymentMethod("cash")}
                />
                <PaymentButton
                  active={paymentMethod === "momo"}
                  label="MoMo"
                  icon={Smartphone}
                  onClick={() => setPaymentMethod("momo")}
                />
                <PaymentButton
                  active={paymentMethod === "card"}
                  label="Card"
                  icon={CreditCard}
                  onClick={() => setPaymentMethod("card")}
                />
              </div>
            </div>

            {paymentMethod === "cash" ? (
              <label className="block text-sm font-medium text-emerald-950">
                Cash received
                <div className="mt-1 flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  />
                  <button
                    type="button"
                    onClick={() => setCashReceived(estimatedTotal.toFixed(2))}
                    className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Exact
                  </button>
                </div>
              </label>
            ) : (
              <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                {paymentMethod === "momo" ? "MoMo" : "Card"} is recorded as an exact payment.
              </p>
            )}

            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button
                type="button"
                title="Park sale"
                disabled={items.length === 0}
                onClick={handleParkSale}
                className="flex h-11 items-center justify-center gap-2 rounded-md border border-emerald-900/15 px-4 text-sm font-medium text-emerald-950 hover:bg-emerald-50 disabled:opacity-50"
              >
                <Pause className="h-4 w-4" />
                Park
              </button>
              <button
                type="button"
                disabled={items.length === 0 || !stockReady || checkingOut || !online}
                onClick={handleCheckout}
                className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {checkingOut ? "Completing sale..." : `Checkout ${currency.format(estimatedTotal)}`}
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  momo: "MoMo",
  card: "Card",
};

function PaymentButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 items-center justify-center gap-2 rounded-md border text-xs font-medium ${
        active
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ProductCardsSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="rounded-md border border-zinc-200 p-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
          <div className="mt-5 flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </>
  );
}
