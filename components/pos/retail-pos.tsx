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
  RotateCcw,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReceiptModal } from "@/components/pos/receipt-modal";
import { ReturnModal } from "@/components/pos/return-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  checkoutRetailSale,
  getSaleReceipt,
  subscribeRecentRetailSales,
  voidSale,
} from "@/lib/services/sales.service";
import { getPosSettings } from "@/lib/services/settings.service";
import { subscribeBatches, subscribeProducts } from "@/lib/services/inventory.service";
import { allocateFefoStock } from "@/lib/utils/fefo";
import { canAdjustStock } from "@/lib/utils/rbac";
import { usePosCart } from "@/stores/pos-cart";
import type {
  Batch,
  PaymentSplit,
  Product,
  ReceiptData,
  SaleDiscount,
  SaleTransaction,
  SinglePaymentMethod,
} from "@/types";

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const number = new Intl.NumberFormat("en-GH");
const timeFormat = new Intl.DateTimeFormat("en-GH", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "short",
});

const PAYMENT_METHODS: Array<{ value: SinglePaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "momo", label: "MoMo", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
];

const PAYMENT_LABEL: Record<string, string> = { cash: "Cash", momo: "MoMo", card: "Card", split: "Split" };

const DEFAULT_discountThreshold = 20;

function toDate(value: SaleTransaction["sale_date"]) {
  if (!value) return new Date();
  return typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeDiscountAmount(subtotal: number, discount: SaleDiscount | null): number {
  if (!discount || discount.value <= 0) return 0;
  const raw = discount.type === "pct"
    ? subtotal * (discount.value / 100)
    : discount.value;
  return money(Math.min(raw, subtotal));
}

export function RetailPos() {
  const { user, appUser, role, permissions } = useAuth();
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(true);
  const [recentSales, setRecentSales] = useState<SaleTransaction[]>([]);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [returnSaleId, setReturnSaleId] = useState<string | null>(null);
  const [fetchingReceipt, setFetchingReceipt] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [discountThreshold, setDiscountThreshold] = useState(DEFAULT_discountThreshold);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  // Payment state
  const [splitMode, setSplitMode] = useState(false);
  const [singleMethod, setSingleMethod] = useState<SinglePaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [splits, setSplits] = useState<Array<{ method: SinglePaymentMethod; amount: string }>>([
    { method: "cash", amount: "" },
    { method: "momo", amount: "" },
  ]);

  const {
    items,
    parkedSales,
    discount,
    addProduct,
    setQuantity,
    removeProduct,
    clearCart,
    setDiscount,
    parkCart,
    resumeParkedSale,
    deleteParkedSale,
  } = usePosCart();

  const isManager = canAdjustStock(permissions);
  const actor = user && appUser && role ? { uid: user.uid, name: appUser.name, role } : null;

  useEffect(() => {
    getPosSettings()
      .then((s) => setDiscountThreshold(s.discount_threshold_pct))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!confirmVoidId) return;
    const timer = setTimeout(() => setConfirmVoidId(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmVoidId]);

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
          (nextProducts) => { setProducts(nextProducts); setProductsLoading(false); },
          () => { setProductsLoading(false); handleError("Products could not be loaded."); },
        ),
        subscribeBatches(
          (nextBatches) => { setBatches(nextBatches); setBatchesLoading(false); },
          () => { setBatchesLoading(false); handleError("Batch stock could not be loaded."); },
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
      unsubscribes.forEach((u) => u());
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [toast]);

  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeProducts
      .filter((product) =>
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
          batches.filter((b) => b.product_id === item.product_id),
          item.quantity,
        );
        const lineTotal = allocation.allocations.reduce(
          (total, a) => total + a.quantity * a.batch.retail_price,
          0,
        );
        return { ...item, allocation, lineTotal };
      }),
    [batches, items],
  );

  const subtotal = cartLines.reduce((t, l) => t + l.lineTotal, 0);
  const discountAmount = computeDiscountAmount(subtotal, discount);
  const total = money(subtotal - discountAmount);
  const totalUnits = items.reduce((t, i) => t + i.quantity, 0);
  const stockReady = cartLines.every((l) => l.allocation.fulfilled);

  const discountExceedsThreshold =
    discount &&
    discount.value > 0 &&
    (discount.type === "pct"
      ? discount.value > discountThreshold
      : discountAmount / subtotal > discountThreshold / 100);

  const splitsTotal = money(splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
  const splitsValid = splitsTotal >= total && splits.some((s) => Number(s.amount) > 0);
  const singleCashTendered = Number(cashReceived) || 0;

  const canCheckout =
    items.length > 0 &&
    stockReady &&
    !checkingOut &&
    online &&
    !(discountExceedsThreshold && !isManager) &&
    (splitMode
      ? splitsValid
      : singleMethod !== "cash" || singleCashTendered >= total);

  function productStock(productId: string) {
    return allocateFefoStock(batches.filter((b) => b.product_id === productId), 1);
  }

  function handleAddProduct(product: Product) {
    const stock = productStock(product.id);
    const currentQuantity = items.find((i) => i.product_id === product.id)?.quantity ?? 0;
    if (stock.available <= currentQuantity) {
      toast({ title: "No more sellable stock", description: `${product.name_brand} has ${stock.available} units available.`, variant: "error" });
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
      (p) => p.barcode_primary.toLowerCase() === term || p.barcode_internal?.toLowerCase() === term,
    );
    const product = barcodeMatch ?? (visibleProducts.length === 1 ? visibleProducts[0] : null);
    if (product) { handleAddProduct(product); return; }
    toast({
      title: term ? "Select a matching product" : "Scan or search for a product",
      description: term ? `${visibleProducts.length} products match.` : "Enter a barcode, brand, or generic name.",
      variant: "info",
    });
  }

  function changeQuantity(productId: string, nextQuantity: number, available: number) {
    if (nextQuantity > available) {
      toast({ title: "Insufficient stock", description: `Only ${available} sellable units are available.`, variant: "error" });
      return;
    }
    setQuantity(productId, nextQuantity);
  }

  function handleParkSale() {
    if (items.length === 0) return;
    parkCart();
    setCashReceived("");
    setSplitMode(false);
    toast({ title: "Sale parked", description: "The cart was saved on this device.", variant: "success" });
  }

  async function handleCheckout() {
    if (!actor) { toast({ title: "Checkout unavailable", description: "Your user profile is required.", variant: "error" }); return; }
    if (!online) { toast({ title: "Checkout requires a connection", description: "Reconnect before completing the sale.", variant: "error" }); return; }

    setCheckingOut(true);
    try {
      const paymentSplits: PaymentSplit[] | undefined = splitMode
        ? splits.filter((s) => Number(s.amount) > 0).map((s) => ({ method: s.method, amount: money(Number(s.amount)) }))
        : undefined;

      const result = await checkoutRetailSale(
        {
          items,
          batches,
          payment_method: splitMode ? "split" : singleMethod,
          amount_tendered: !splitMode && singleMethod === "cash" ? singleCashTendered : undefined,
          payment_splits: paymentSplits,
          discount,
        },
        actor,
      );

      clearCart();
      setCashReceived("");
      setSplitMode(false);
      setSplits([{ method: "cash", amount: "" }, { method: "momo", amount: "" }]);
      setReceiptData(result.receipt);
      searchRef.current?.focus();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const message =
        rawMessage.includes("available") || rawMessage.includes("total") || rawMessage.includes("below")
          ? rawMessage
          : rawMessage.includes("offline")
            ? "Checkout could not complete because Firestore is offline."
            : "Checkout could not complete. Check Firebase permissions.";
      toast({ title: "Sale not completed", description: message, variant: "error" });
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleReprintSale(saleId: string) {
    setFetchingReceipt(saleId);
    try {
      const receipt = await getSaleReceipt(saleId);
      if (receipt) setReceiptData(receipt);
      else toast({ title: "Receipt not found", description: "The sale record could not be loaded.", variant: "error" });
    } catch {
      toast({ title: "Could not load receipt", description: "Check your connection and try again.", variant: "error" });
    } finally {
      setFetchingReceipt(null);
    }
  }

  async function handleVoidSale(saleId: string) {
    if (!actor) return;
    if (confirmVoidId !== saleId) { setConfirmVoidId(saleId); return; }
    setVoidingId(saleId);
    setConfirmVoidId(null);
    try {
      await voidSale(saleId, actor);
      toast({ title: "Sale voided", description: `Reference: ${saleId.slice(-10).toUpperCase()}`, variant: "success" });
    } catch (err) {
      toast({ title: "Void failed", description: err instanceof Error ? err.message : "Could not void sale.", variant: "error" });
    } finally {
      setVoidingId(null);
    }
  }

  const loading = productsLoading || batchesLoading;

  return (
    <div className="space-y-5">
      {receiptData ? <ReceiptModal receipt={receiptData} onClose={() => setReceiptData(null)} /> : null}
      {returnSaleId && actor ? (
        <ReturnModal saleId={returnSaleId} actor={actor} onClose={() => setReturnSaleId(null)} />
      ) : null}

      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Retail workflow</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Point of Sale</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Scan or search products, allocate FEFO stock, and complete an atomic retail sale.
          </p>
        </div>
        <div className={`flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium ${online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {online ? "Online checkout ready" : "Checkout offline"}
        </div>
      </header>

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)]">
        {/* Left: product grid + parked + recent */}
        <div className="space-y-4">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-zinc-400" />
            <input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                            <p className="font-mono text-[11px] text-zinc-500">{product.barcode_primary}</p>
                            <p className="mt-1 text-xs text-zinc-600">{number.format(stock.available)} available</p>
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
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{parkedSales.length}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {parkedSales.map((sale) => (
                  <div key={sale.id} className="rounded-md border border-zinc-200 p-3">
                    <p className="text-sm font-medium text-emerald-950">{sale.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {sale.items.reduce((s, i) => s + i.quantity, 0)} units | {new Date(sale.parked_at).toLocaleString("en-GH")}
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
                      <p className="truncate font-mono text-[11px] text-zinc-400">{sale.id.slice(-10).toUpperCase()}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {timeFormat.format(toDate(sale.sale_date))} · {sale.item_count} item{sale.item_count === 1 ? "" : "s"} · {PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${sale.status === "voided" ? "text-zinc-400 line-through" : "text-emerald-950"}`}>
                          {currency.format(sale.total)}
                        </p>
                        {sale.status === "voided" ? (
                          <p className="text-[10px] font-medium text-red-500">Voided</p>
                        ) : null}
                      </div>
                      {isManager && sale.status !== "voided" ? (
                        <button
                          type="button"
                          title="Process return"
                          onClick={() => setReturnSaleId(sale.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {isManager && sale.status !== "voided" ? (
                        <button
                          type="button"
                          title={confirmVoidId === sale.id ? "Confirm void" : "Void sale"}
                          disabled={voidingId === sale.id}
                          onClick={() => handleVoidSale(sale.id)}
                          className={`flex h-8 w-8 items-center justify-center rounded-md border text-zinc-500 disabled:opacity-50 ${
                            confirmVoidId === sale.id
                              ? "border-red-300 bg-red-50 text-red-600"
                              : "border-zinc-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                          }`}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
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

        {/* Right: cart + discount + payment */}
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
              <button type="button" onClick={clearCart} className="text-xs font-medium text-red-600 hover:text-red-700">Clear</button>
            ) : null}
          </header>

          <div className="max-h-[340px] divide-y divide-zinc-100 overflow-y-auto">
            {cartLines.map((line) => (
              <div key={line.product_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-emerald-950">{line.product_name_snapshot}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {line.allocation.fulfilled
                        ? `${line.allocation.allocations.length} FEFO batch${line.allocation.allocations.length === 1 ? "" : "es"}`
                        : `Only ${line.allocation.available} available`}
                    </p>
                  </div>
                  <button type="button" title="Remove" onClick={() => removeProduct(line.product_id)} className="text-zinc-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center rounded-md border border-zinc-200">
                    <button type="button" title="Decrease" onClick={() => changeQuantity(line.product_id, line.quantity - 1, line.allocation.available)} className="flex h-8 w-8 items-center justify-center hover:bg-zinc-50">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      aria-label={`${line.product_name_snapshot} quantity`}
                      type="number" min="1" value={line.quantity}
                      onChange={(e) => changeQuantity(line.product_id, Math.max(1, Number(e.target.value) || 1), line.allocation.available)}
                      className="h-8 w-12 border-x border-zinc-200 text-center text-sm outline-none"
                    />
                    <button type="button" title="Increase" onClick={() => changeQuantity(line.product_id, line.quantity + 1, line.allocation.available)} className="flex h-8 w-8 items-center justify-center hover:bg-zinc-50">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-emerald-950">{currency.format(line.lineTotal)}</p>
                </div>
                {!line.allocation.fulfilled ? (
                  <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">Reduce quantity before checkout.</p>
                ) : null}
              </div>
            ))}
            {items.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
                <Boxes className="h-8 w-8 text-lime-600" />
                <p className="mt-3 text-sm font-semibold text-emerald-950">Cart is empty</p>
                <p className="mt-1 max-w-xs text-sm text-zinc-500">Scan a barcode or select a product to begin.</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 border-t border-emerald-900/10 p-4">
            {/* Discount section */}
            {items.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium uppercase text-zinc-500">Discount</p>
                  {discount ? (
                    <button type="button" onClick={() => setDiscount(null)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                      <X className="h-3 w-3" />
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <select
                    value={discount?.type ?? "pct"}
                    onChange={(e) => setDiscount({ type: e.target.value as "pct" | "fixed", value: discount?.value ?? 0 })}
                    className="h-9 w-20 rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-emerald-700"
                  >
                    <option value="pct">%</option>
                    <option value="fixed">GHS</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step={discount?.type === "fixed" ? "0.01" : "1"}
                    placeholder="0"
                    value={discount?.value || ""}
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      setDiscount({ type: discount?.type ?? "pct", value: v });
                    }}
                    className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  />
                </div>
                {discountExceedsThreshold && !isManager ? (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Discounts above {discountThreshold}% require manager authorisation.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Totals */}
            <div className="space-y-1">
              {discountAmount > 0 ? (
                <>
                  <div className="flex items-center justify-between text-sm text-zinc-500">
                    <span>Subtotal</span>
                    <span>{currency.format(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-emerald-700">
                    <span>
                      Discount ({discount?.type === "pct" ? `${discount.value}%` : "fixed"})
                    </span>
                    <span>−{currency.format(discountAmount)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-600">Total</p>
                <p className="text-xl font-semibold text-emerald-950">{currency.format(total)}</p>
              </div>
            </div>

            {/* Payment section */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-zinc-500">Payment</p>
                <button
                  type="button"
                  onClick={() => setSplitMode((v) => !v)}
                  className={`text-xs font-medium ${splitMode ? "text-emerald-700" : "text-zinc-500 hover:text-zinc-700"}`}
                >
                  {splitMode ? "Single payment" : "Split payment"}
                </button>
              </div>

              {!splitMode ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSingleMethod(value)}
                        className={`flex h-10 items-center justify-center gap-2 rounded-md border text-xs font-medium ${singleMethod === value ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                  {singleMethod === "cash" ? (
                    <label className="mt-3 block text-sm font-medium text-emerald-950">
                      Cash received
                      <div className="mt-1 flex gap-2">
                        <input
                          type="number" min="0" step="0.01" value={cashReceived}
                          onChange={(e) => setCashReceived(e.target.value)}
                          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                        />
                        <button type="button" onClick={() => setCashReceived(total.toFixed(2))} className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                          Exact
                        </button>
                      </div>
                      {singleCashTendered > 0 && singleCashTendered >= total ? (
                        <p className="mt-1 text-xs text-emerald-700">Change: {currency.format(money(singleCashTendered - total))}</p>
                      ) : null}
                    </label>
                  ) : (
                    <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      {singleMethod === "momo" ? "MoMo" : "Card"} is recorded as an exact payment.
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  {splits.map((split, i) => (
                    <div key={i} className="flex gap-2">
                      <select
                        value={split.method}
                        onChange={(e) => {
                          const next = [...splits];
                          next[i] = { ...next[i], method: e.target.value as SinglePaymentMethod };
                          setSplits(next);
                        }}
                        className="h-9 w-24 rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-emerald-700"
                      >
                        {PAYMENT_METHODS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={split.amount}
                        onChange={(e) => {
                          const next = [...splits];
                          next[i] = { ...next[i], amount: e.target.value };
                          setSplits(next);
                        }}
                        className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700"
                      />
                      {splits.length > 2 ? (
                        <button type="button" onClick={() => setSplits(splits.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-400 hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {splits.length < 3 ? (
                    <button type="button" onClick={() => setSplits([...splits, { method: "card", amount: "" }])} className="text-xs font-medium text-emerald-700 hover:text-emerald-800">
                      + Add payment line
                    </button>
                  ) : null}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-zinc-500">Split total</span>
                    <span className={splitsTotal >= total ? "font-medium text-emerald-700" : "text-red-600"}>
                      {currency.format(splitsTotal)} {splitsTotal >= total && money(splitsTotal - total) > 0 ? `(change: ${currency.format(money(splitsTotal - total))})` : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
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
                disabled={!canCheckout}
                onClick={handleCheckout}
                className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {checkingOut ? "Completing sale…" : `Checkout ${currency.format(total)}`}
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
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
