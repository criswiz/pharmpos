"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, ClipboardList, Minus, Plus, Send, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { PurchasingNav } from "@/components/purchasing/purchasing-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { subscribeProducts } from "@/lib/services/inventory.service";
import { subscribeSuppliers } from "@/lib/services/supplier.service";
import {
  createPurchaseOrder,
  subscribePurchaseOrders,
  updatePurchaseOrderStatus,
} from "@/lib/services/purchasing.service";
import { purchaseOrderSchema, type PurchaseOrderInput } from "@/lib/validation/po";
import type { FirestoreDate, Product, PurchaseOrder, Supplier } from "@/types";

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });

function inputDateToday() {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function formatDate(value: FirestoreDate) {
  const d = typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
  return new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

const STATUS_STYLES: Record<PurchaseOrder["status"], string> = {
  draft: "bg-zinc-100 text-zinc-600",
  sent: "bg-sky-50 text-sky-700",
  partially_received: "bg-amber-50 text-amber-700",
  received: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<PurchaseOrder["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

const LINE_DEFAULTS = {
  product_id: "",
  product_name_snapshot: "",
  quantity_ordered: 1,
  unit_cost: 0,
};

export function PoList() {
  const { user, appUser, role } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrder["status"] | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const actor = user && appUser && role ? { uid: user.uid, name: appUser.name, role } : null;

  useEffect(() => {
    let pending = 3;
    const done = () => { if (--pending === 0) setLoading(false); };
    const unsubscribes: Array<() => void> = [];
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      unsubscribes.push(
        subscribePurchaseOrders((data) => { setOrders(data); done(); }, () => { setLoadError("Purchase orders could not be loaded."); done(); }),
        subscribeProducts((data) => { setProducts(data); done(); }, () => done()),
        subscribeSuppliers((data) => { setSuppliers(data); done(); }, () => done()),
      );
    } catch {
      fallbackTimer = setTimeout(() => {
        setLoadError("Add Firebase credentials to .env.local.");
        setLoading(false);
      }, 0);
    }
    return () => {
      unsubscribes.forEach((u) => u());
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, []);

  const filtered = useMemo(
    () => statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter),
    [orders, statusFilter],
  );

  async function handleStatusChange(po: PurchaseOrder, status: PurchaseOrder["status"]) {
    if (!actor) return;
    setUpdatingId(po.id);
    try {
      await updatePurchaseOrderStatus(po.id, status, actor);
      toast({ title: "Status updated", description: `${po.po_number} → ${STATUS_LABEL[status]}`, variant: "success" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Update failed.";
      toast({ title: "Could not update status", description: msg, variant: "error" });
    } finally {
      setUpdatingId(null);
    }
  }

  const activeProducts = products.filter((p) => p.is_active);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Purchasing</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Purchase Orders</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Track what has been ordered from suppliers. Received POs link to GRNs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          disabled={suppliers.length === 0 || activeProducts.length === 0}
          className="flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Create PO
        </button>
      </header>

      <PurchasingNav />

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partially_received">Partially received</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="flex h-10 items-center rounded-md border border-emerald-900/10 bg-white px-3 text-sm text-zinc-600">
          {filtered.length} orders
        </div>
      </div>

      <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-212.5 border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">PO #</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Order date</th>
                <th className="px-4 py-3 font-semibold">Expected</th>
                <th className="px-4 py-3 font-semibold">Lines</th>
                <th className="px-4 py-3 font-semibold">Value</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map((po) => (
                    <tr key={po.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-mono font-semibold text-emerald-950">{po.po_number}</td>
                      <td className="px-4 py-3 text-zinc-700">{po.supplier_name_snapshot}</td>
                      <td className="px-4 py-3 text-zinc-700">{formatDate(po.order_date)}</td>
                      <td className="px-4 py-3 text-zinc-500">
                        {po.expected_delivery_date ? formatDate(po.expected_delivery_date) : "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{po.line_items.length}</td>
                      <td className="px-4 py-3 text-zinc-700">{currency.format(po.total_value)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[po.status]}`}>
                          {STATUS_LABEL[po.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {po.status === "draft" ? (
                            <button
                              type="button"
                              title="Mark as sent"
                              disabled={updatingId === po.id}
                              onClick={() => handleStatusChange(po, "sent")}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {po.status === "sent" || po.status === "partially_received" ? (
                            <button
                              type="button"
                              title="Mark as received"
                              disabled={updatingId === po.id}
                              onClick={() => handleStatusChange(po, "received")}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {po.status !== "cancelled" && po.status !== "received" ? (
                            <button
                              type="button"
                              title="Cancel order"
                              disabled={updatingId === po.id}
                              onClick={() => handleStatusChange(po, "cancelled")}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
            <ClipboardList className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No purchase orders</p>
            <p className="mt-1 text-sm text-zinc-500">Create a PO to start tracking orders with suppliers.</p>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <PoForm
          products={activeProducts}
          suppliers={suppliers.filter((s) => s.is_active)}
          actor={actor}
          onClose={() => setFormOpen(false)}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

function PoForm({
  products,
  suppliers,
  actor,
  onClose,
  toast,
}: {
  products: Product[];
  suppliers: Supplier[];
  actor: { uid: string; name: string; role: string } | null;
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      supplier_id: "",
      supplier_name_snapshot: "",
      order_date: inputDateToday(),
      expected_delivery_date: "",
      notes: "",
      lines: [{ ...LINE_DEFAULTS }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = useWatch({ control, name: "lines" });

  const totalValue = useMemo(
    () => (watchedLines ?? []).reduce(
      (sum, l) => sum + (l.quantity_ordered || 0) * (l.unit_cost || 0),
      0,
    ),
    [watchedLines],
  );

  async function onSubmit(input: PurchaseOrderInput) {
    setSubmitError("");
    if (!actor) { setSubmitError("Your profile is required."); return; }
    try {
      const { poNumber } = await createPurchaseOrder(input, actor);
      toast({ title: `PO ${poNumber} created`, description: `${input.lines.length} product${input.lines.length === 1 ? "" : "s"} ordered from ${input.supplier_name_snapshot}.`, variant: "success" });
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "PO could not be created.";
      setSubmitError(msg);
    }
  }

  const fc = "mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Purchasing</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Create purchase order</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-x-5 gap-y-4 border-b border-zinc-100 p-5 md:grid-cols-2">
            <label className="text-sm font-medium text-emerald-950">
              Supplier *
              <select
                className={fc}
                {...register("supplier_id")}
                onChange={(e) => {
                  const sup = suppliers.find((s) => s.id === e.target.value);
                  setValue("supplier_id", e.target.value);
                  setValue("supplier_name_snapshot", sup?.name ?? "");
                }}
              >
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="hidden" {...register("supplier_name_snapshot")} />
              {errors.supplier_id ? <span className="mt-1 block text-xs font-normal text-red-600">{errors.supplier_id.message}</span> : null}
            </label>
            <label className="text-sm font-medium text-emerald-950">
              Order date *
              <input type="date" className={fc} {...register("order_date")} />
              {errors.order_date ? <span className="mt-1 block text-xs font-normal text-red-600">{errors.order_date.message}</span> : null}
            </label>
            <label className="text-sm font-medium text-emerald-950">
              Expected delivery
              <input type="date" className={fc} {...register("expected_delivery_date")} />
            </label>
            <label className="text-sm font-medium text-emerald-950">
              Notes
              <input className={fc} {...register("notes")} />
            </label>
          </div>

          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-950">Products ordered</h3>
              <button type="button" onClick={() => append({ ...LINE_DEFAULTS })} className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                <Plus className="h-3.5 w-3.5" />
                Add product
              </button>
            </div>

            <div className="space-y-3">
              {fields.map((field, i) => {
                const lineErrors = errors.lines?.[i];
                return (
                  <div key={field.id} className="grid items-end gap-3 rounded-md border border-zinc-200 p-3 md:grid-cols-[1fr_100px_120px_32px]">
                    <label className="text-xs font-medium text-emerald-950">
                      Product *
                      <select
                        className={fc}
                        {...register(`lines.${i}.product_id`)}
                        onChange={(e) => {
                          const product = products.find((p) => p.id === e.target.value);
                          setValue(`lines.${i}.product_id`, e.target.value);
                          setValue(`lines.${i}.product_name_snapshot`, product?.name_brand ?? "");
                        }}
                      >
                        <option value="">Select product</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name_brand}</option>)}
                      </select>
                      <input type="hidden" {...register(`lines.${i}.product_name_snapshot`)} />
                      {lineErrors?.product_id ? <span className="text-xs text-red-600">{lineErrors.product_id.message}</span> : null}
                    </label>
                    <label className="text-xs font-medium text-emerald-950">
                      Qty *
                      <input type="number" min="1" step="1" className={fc} {...register(`lines.${i}.quantity_ordered`, { valueAsNumber: true })} />
                      {lineErrors?.quantity_ordered ? <span className="text-xs text-red-600">{lineErrors.quantity_ordered.message}</span> : null}
                    </label>
                    <label className="text-xs font-medium text-emerald-950">
                      Unit cost (GHS)
                      <input type="number" min="0" step="0.01" className={fc} {...register(`lines.${i}.unit_cost`, { valueAsNumber: true })} />
                    </label>
                    {fields.length > 1 ? (
                      <button type="button" onClick={() => remove(i)} className="flex h-9 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-400 hover:bg-red-50 hover:text-red-600">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    ) : <div />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-100 px-5 py-4">
          <div className="text-sm text-zinc-600">
            Est. value: <span className="font-semibold text-emerald-950">{currency.format(totalValue)}</span>
            {submitError ? <span className="ml-4 text-red-600">{submitError}</span> : null}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {isSubmitting ? "Creating…" : "Create PO"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
