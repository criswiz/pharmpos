"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Banknote,
  CheckCircle,
  CreditCard,
  Download,
  FileText,
  Minus,
  Plus,
  Search,
  Smartphone,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { subscribeProducts } from "@/lib/services/inventory.service";
import { subscribeBatches } from "@/lib/services/inventory.service";
import { subscribeCustomers } from "@/lib/services/customer.service";
import { getPharmacyInfo } from "@/lib/services/settings.service";
import { hasPermission } from "@/lib/utils/rbac";
import { allocateFefoStock } from "@/lib/utils/fefo";
import {
  convertToInvoice,
  createWholesaleDoc,
  recordPayment,
  subscribeWholesaleDocs,
  voidWholesaleDoc,
} from "@/lib/services/wholesale.service";
import {
  createWholesaleDocSchema,
  type CreateWholesaleDocInput,
} from "@/lib/validation/wholesale";
import type {
  Batch,
  Customer,
  FirestoreDate,
  PharmacyInfo,
  Product,
  WholesaleDocument,
  WholesaleDocStatus,
  WholesaleDocType,
  WholesalePaymentMethod,
} from "@/types";

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const number = new Intl.NumberFormat("en-GH");
const dateFormat = new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" });

function toDate(v: FirestoreDate | undefined): Date {
  if (!v) return new Date();
  return typeof (v as { toDate?: () => Date }).toDate === "function"
    ? (v as { toDate: () => Date }).toDate()
    : (v as Date);
}

function inputDateToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const STATUS_STYLE: Record<WholesaleDocStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  confirmed: "bg-sky-50 text-sky-700",
  partially_paid: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  void: "bg-red-50 text-red-500",
};

const STATUS_LABEL: Record<WholesaleDocStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  partially_paid: "Partial",
  paid: "Paid",
  void: "Void",
};

const PAYMENT_METHODS: Array<{ value: WholesalePaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "momo", label: "MoMo", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "credit", label: "Credit", icon: FileText },
];

// ─── Invoice PDF ──────────────────────────────────────────────────────────────

function openInvoicePdf(doc: WholesaleDocument, pharmacy: PharmacyInfo) {
  const lineRows = doc.line_items
    .map(
      (l) =>
        `<tr>
          <td>${l.product_name_snapshot}</td>
          <td>${l.batch_number_snapshot ?? "—"}</td>
          <td style="text-align:right">${number.format(l.quantity)}</td>
          <td style="text-align:right">${currency.format(l.unit_price)}</td>
          <td style="text-align:right">${currency.format(l.line_total)}</td>
        </tr>`,
    )
    .join("\n");

  const balance = Math.max(0, doc.total - doc.amount_paid);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${doc.type === "proforma" ? "Proforma" : "Invoice"} ${doc.doc_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 16mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .pharmacy h1 { font-size: 16px; font-weight: 700; color: #065f46; }
  .pharmacy p { font-size: 10px; color: #555; margin-top: 2px; }
  .doc-info { text-align: right; }
  .doc-info .type { font-size: 20px; font-weight: 700; color: #065f46; letter-spacing: .05em; }
  .doc-info .number { font-size: 12px; font-weight: 600; }
  .doc-info p { font-size: 10px; color: #555; }
  .divider { border-top: 2px solid #047857; margin: 10px 0; }
  .bill-to { margin-bottom: 16px; }
  .bill-to strong { font-size: 10px; text-transform: uppercase; color: #666; }
  .bill-to p { font-size: 12px; font-weight: 600; }
  .bill-to span { font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead th { background: #ecfdf5; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; border-bottom: 2px solid #047857; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  .totals { width: 260px; margin-left: auto; }
  .totals tr td { padding: 3px 8px; }
  .totals tr:last-child td { font-size: 13px; font-weight: 700; border-top: 2px solid #047857; padding-top: 6px; }
  .balance { color: ${balance > 0 ? "#dc2626" : "#047857"}; }
  .notes { margin-top: 14px; font-size: 10px; color: #555; }
  @media print { body { padding: 0; } @page { margin: 15mm; } }
</style>
</head>
<body>
  <div class="header">
    <div class="pharmacy">
      <h1>${pharmacy.name}</h1>
      ${pharmacy.tagline ? `<p>${pharmacy.tagline}</p>` : ""}
      ${pharmacy.address ? `<p>${pharmacy.address}</p>` : ""}
      ${pharmacy.phone ? `<p>Tel: ${pharmacy.phone}</p>` : ""}
      ${pharmacy.fda_number ? `<p>FDA Reg: ${pharmacy.fda_number}</p>` : ""}
    </div>
    <div class="doc-info">
      <div class="type">${doc.type === "proforma" ? "PROFORMA" : "INVOICE"}</div>
      <div class="number">${doc.doc_number}</div>
      <p>Date: ${dateFormat.format(toDate(doc.created_at))}</p>
    </div>
  </div>
  <div class="divider"></div>
  <div class="bill-to">
    <strong>Bill To</strong>
    <p>${doc.customer_name_snapshot}</p>
    ${doc.customer_phone_snapshot ? `<span>${doc.customer_phone_snapshot}</span><br>` : ""}
    ${doc.customer_address_snapshot ? `<span>${doc.customer_address_snapshot}</span>` : ""}
  </div>
  <table>
    <thead>
      <tr><th>Product</th><th>Batch #</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">${currency.format(doc.subtotal)}</td></tr>
    ${doc.discount_amount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-${currency.format(doc.discount_amount)}</td></tr>` : ""}
    <tr><td>Total</td><td style="text-align:right">${currency.format(doc.total)}</td></tr>
    ${doc.amount_paid > 0 ? `<tr><td>Amount Paid</td><td style="text-align:right">${currency.format(doc.amount_paid)}</td></tr>` : ""}
    <tr><td><strong>Balance Due</strong></td><td style="text-align:right" class="balance"><strong>${currency.format(balance)}</strong></td></tr>
  </table>
  ${doc.notes ? `<div class="notes">Notes: ${doc.notes}</div>` : ""}
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WholesaleOrders() {
  const { user, appUser, role, permissions } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<WholesaleDocument[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [pharmacy, setPharmacy] = useState<PharmacyInfo | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<WholesaleDocType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<WholesaleDocStatus | "all">("all");

  const [formOpen, setFormOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [paymentDocId, setPaymentDocId] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const actor = user && appUser && role ? { uid: user.uid, name: appUser.name, role } : null;
  const isManager = hasPermission(permissions, "inventory:write");

  useEffect(() => {
    getPharmacyInfo().then(setPharmacy).catch(() => undefined);
    let pending = 4;
    const done = () => { if (--pending === 0) setLoading(false); };
    const unsubscribes: Array<() => void> = [];
    try {
      unsubscribes.push(
        subscribeWholesaleDocs((d) => { setDocs(d); done(); }, () => done()),
        subscribeProducts((p) => { setProducts(p); done(); }, () => done()),
        subscribeBatches((b) => { setBatches(b); done(); }, () => done()),
        subscribeCustomers((c) => { setCustomers(c); done(); }, () => done()),
      );
    } catch {
      setTimeout(() => setLoading(false), 0);
    }
    return () => unsubscribes.forEach((u) => u());
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return docs.filter((d) => {
      const matchSearch =
        !term ||
        d.doc_number.toLowerCase().includes(term) ||
        d.customer_name_snapshot.toLowerCase().includes(term);
      const matchType = typeFilter === "all" || d.type === typeFilter;
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [docs, search, typeFilter, statusFilter]);

  async function handleConfirmProforma(docId: string, paymentMethod: WholesalePaymentMethod) {
    if (!actor) return;
    setActionPending(docId + ":confirm");
    try {
      const { invoiceNumber } = await convertToInvoice(docId, paymentMethod, batches, actor);
      toast({ title: `Invoice ${invoiceNumber} created`, variant: "success" });
      setConfirmingId(null);
    } catch (err) {
      toast({ title: "Conversion failed", description: err instanceof Error ? err.message : "Try again.", variant: "error" });
    } finally {
      setActionPending(null);
    }
  }

  async function handleVoid(docId: string) {
    if (!actor) return;
    setActionPending(docId + ":void");
    try {
      await voidWholesaleDoc(docId, actor);
      toast({ title: "Document voided", variant: "success" });
    } catch (err) {
      toast({ title: "Void failed", description: err instanceof Error ? err.message : "Try again.", variant: "error" });
    } finally {
      setActionPending(null);
    }
  }

  const activeCustomers = customers.filter((c) => c.is_active && (c.customer_type === "wholesale" || c.customer_type === "both"));
  const activeProducts = products.filter((p) => p.is_active);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Wholesale channel</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Wholesale Orders</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Create proformas and invoices for wholesale customers. Stock is deducted when an invoice is confirmed.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            disabled={activeCustomers.length === 0 || activeProducts.length === 0}
            className="flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            New document
          </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr_140px_180px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search doc # or customer" className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" />
        </label>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700">
          <option value="all">All types</option>
          <option value="proforma">Proformas</option>
          <option value="invoice">Invoices</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="partially_paid">Partially paid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
        <div className="flex h-10 items-center rounded-md border border-emerald-900/10 bg-white px-3 text-sm text-zinc-600">{filtered.length} docs</div>
      </div>

      <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Document</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Paid</th>
                <th className="px-4 py-3 font-semibold">Balance</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 8 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>
                  ))
                : filtered.map((d) => {
                    const balance = Math.max(0, d.total - d.amount_paid);
                    return (
                      <tr key={d.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <p className="font-mono font-semibold text-emerald-950">{d.doc_number}</p>
                          <p className="text-xs capitalize text-zinc-400">{d.type}</p>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{d.customer_name_snapshot}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs">{dateFormat.format(toDate(d.created_at))}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-950">{currency.format(d.total)}</td>
                        <td className="px-4 py-3 text-zinc-700">{d.amount_paid > 0 ? currency.format(d.amount_paid) : "—"}</td>
                        <td className="px-4 py-3">
                          {balance > 0 ? (
                            <span className="font-medium text-amber-700">{currency.format(balance)}</span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLE[d.status]}`}>
                            {STATUS_LABEL[d.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* Download PDF */}
                            {pharmacy ? (
                              <button type="button" title="Download PDF" onClick={() => openInvoicePdf(d, pharmacy)} className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-emerald-700">
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {/* Confirm proforma */}
                            {d.type === "proforma" && d.status === "draft" ? (
                              confirmingId === d.id ? (
                                <ConfirmPaymentPicker
                                  onSelect={(method) => handleConfirmProforma(d.id, method)}
                                  onCancel={() => setConfirmingId(null)}
                                  loading={actionPending === d.id + ":confirm"}
                                />
                              ) : (
                                <button type="button" title="Confirm as invoice" onClick={() => setConfirmingId(d.id)} className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-sky-50 hover:text-sky-700">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </button>
                              )
                            ) : null}
                            {/* Record payment */}
                            {d.type === "invoice" && (d.status === "confirmed" || d.status === "partially_paid") ? (
                              <button type="button" title="Record payment" onClick={() => setPaymentDocId(d.id)} className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-700">
                                <Banknote className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {/* Void */}
                            {isManager && d.status !== "void" && d.status !== "paid" ? (
                              <button type="button" title="Void document" disabled={actionPending === d.id + ":void"} onClick={() => handleVoid(d.id)} className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
            <FileText className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No documents found</p>
            <p className="mt-1 text-sm text-zinc-500">Create a proforma or invoice to get started.</p>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <WholesaleDocForm
          products={activeProducts}
          batches={batches}
          customers={activeCustomers}
          actor={actor}
          onClose={() => setFormOpen(false)}
          toast={toast}
        />
      ) : null}

      {paymentDocId ? (
        <PaymentModal
          doc={docs.find((d) => d.id === paymentDocId)!}
          actor={actor}
          onClose={() => setPaymentDocId(null)}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

// ─── Confirm payment picker (inline) ─────────────────────────────────────────

function ConfirmPaymentPicker({
  onSelect,
  onCancel,
  loading,
}: {
  onSelect: (method: WholesalePaymentMethod) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {PAYMENT_METHODS.map(({ value, icon: Icon }) => (
        <button key={value} type="button" title={value} disabled={loading} onClick={() => onSelect(value)} className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50">
          <Icon className="h-3 w-3" />
        </button>
      ))}
      <button type="button" onClick={onCancel} disabled={loading} className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-400 hover:bg-zinc-50">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({
  doc,
  actor,
  onClose,
  toast,
}: {
  doc: WholesaleDocument;
  actor: { uid: string; name: string; role: string } | null;
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const balance = Math.max(0, doc.total - doc.amount_paid);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const val = Math.round((parseFloat(amount) + Number.EPSILON) * 100) / 100;
    if (!val || val <= 0) { setError("Enter a valid amount."); return; }
    if (val > balance) { setError(`Cannot exceed balance of ${currency.format(balance)}.`); return; }
    if (!actor) { setError("Your profile is required."); return; }
    setSaving(true);
    try {
      await recordPayment(doc.id, val, actor);
      toast({ title: "Payment recorded", description: `${currency.format(val)} on ${doc.doc_number}`, variant: "success" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Wholesale</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Record payment</h2>
            <p className="mt-0.5 text-sm text-zinc-500">{doc.doc_number} · {doc.customer_name_snapshot}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div className="flex justify-between rounded-md bg-zinc-50 px-4 py-3 text-sm">
            <span className="text-zinc-600">Balance due</span>
            <span className="font-semibold text-amber-700">{currency.format(balance)}</span>
          </div>
          <label className="block text-sm font-medium text-emerald-950">
            Amount received (GHS)
            <input
              type="number" min="0.01" step="0.01" value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(""); }}
              className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            />
          </label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-3 border-t border-zinc-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
          <button type="button" disabled={saving} onClick={handleSave} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {saving ? "Saving…" : "Record payment"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Document Create Form ─────────────────────────────────────────────────────

const LINE_DEFAULTS = { product_id: "", product_name_snapshot: "", quantity: 1, unit_price: 0 };

function WholesaleDocForm({
  products,
  batches,
  customers,
  actor,
  onClose,
  toast,
}: {
  products: Product[];
  batches: Batch[];
  customers: Customer[];
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
  } = useForm<CreateWholesaleDocInput>({
    resolver: zodResolver(createWholesaleDocSchema),
    defaultValues: {
      type: "invoice",
      customer_id: "",
      customer_name_snapshot: "",
      payment_method: "credit",
      discount_amount: 0,
      notes: "",
      lines: [{ ...LINE_DEFAULTS }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = useWatch({ control, name: "lines" });
  const watchedType = useWatch({ control, name: "type" });
  const watchedDiscount = useWatch({ control, name: "discount_amount" }) ?? 0;
  const watchedPaymentMethod = useWatch({ control, name: "payment_method" });

  const subtotal = useMemo(
    () => (watchedLines ?? []).reduce((s, l) => s + (l.quantity || 0) * (l.unit_price || 0), 0),
    [watchedLines],
  );
  const total = Math.max(0, subtotal - (watchedDiscount || 0));

  async function onSubmit(input: CreateWholesaleDocInput) {
    setSubmitError("");
    if (!actor) { setSubmitError("Your profile is required."); return; }
    try {
      const { docNumber } = await createWholesaleDoc(input, products, batches, actor);
      toast({ title: `${input.type === "proforma" ? "Proforma" : "Invoice"} ${docNumber} created`, variant: "success" });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create document.");
    }
  }

  const fc = "mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Wholesale</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">New document</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Header fields */}
          <div className="grid gap-x-5 gap-y-4 border-b border-zinc-100 p-5 md:grid-cols-3">
            <label className="text-sm font-medium text-emerald-950">
              Document type
              <select className={fc} {...register("type")}>
                <option value="invoice">Invoice (deducts stock)</option>
                <option value="proforma">Proforma (no stock deduction)</option>
              </select>
            </label>
            <label className="text-sm font-medium text-emerald-950">
              Customer *
              <select
                className={fc}
                {...register("customer_id")}
                onChange={(e) => {
                  const c = customers.find((c) => c.id === e.target.value);
                  setValue("customer_id", e.target.value);
                  setValue("customer_name_snapshot", c?.name ?? "");
                  setValue("customer_phone_snapshot", c?.phone ?? "");
                  setValue("customer_address_snapshot", c?.address ?? "");
                }}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.credit_limit > 0 ? ` (limit: ${currency.format(c.credit_limit)})` : ""}
                  </option>
                ))}
              </select>
              <input type="hidden" {...register("customer_name_snapshot")} />
              <input type="hidden" {...register("customer_phone_snapshot")} />
              <input type="hidden" {...register("customer_address_snapshot")} />
              {errors.customer_id ? <span className="mt-0.5 block text-xs font-normal text-red-600">{errors.customer_id.message}</span> : null}
            </label>
            {watchedType === "invoice" ? (
              <label className="text-sm font-medium text-emerald-950">
                Payment method *
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => {
                    const checked = watchedPaymentMethod === value;
                    return (
                      <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${checked ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-zinc-200 text-zinc-700"}`}>
                        <input type="radio" value={value} {...register("payment_method")} className="hidden" />
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </label>
            ) : (
              <label className="text-sm font-medium text-emerald-950">
                Date
                <input type="date" defaultValue={inputDateToday()} className={fc} readOnly />
              </label>
            )}
          </div>

          {/* Line items */}
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-950">Products</h3>
              <button type="button" onClick={() => append({ ...LINE_DEFAULTS })} className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                <Plus className="h-3.5 w-3.5" />Add product
              </button>
            </div>

            <div className="space-y-3">
              {fields.map((field, i) => {
                const lineErrors = errors.lines?.[i];
                const selectedProduct = products.find((p) => p.id === (watchedLines?.[i]?.product_id));
                const wholesaleStock = selectedProduct
                  ? allocateFefoStock(batches.filter((b) => b.product_id === selectedProduct.id), 1, ["wholesale", "shared"]).available
                  : 0;
                return (
                  <div key={field.id} className="grid items-end gap-3 rounded-md border border-zinc-200 p-3 md:grid-cols-[1fr_90px_110px_32px]">
                    <label className="text-xs font-medium text-emerald-950">
                      Product *
                      <select
                        className={fc}
                        {...register(`lines.${i}.product_id`)}
                        onChange={(e) => {
                          const p = products.find((p) => p.id === e.target.value);
                          setValue(`lines.${i}.product_id`, e.target.value);
                          setValue(`lines.${i}.product_name_snapshot`, p?.name_brand ?? "");
                          if (p) {
                            const fefo = allocateFefoStock(batches.filter((b) => b.product_id === p.id), 1, ["wholesale", "shared"]);
                            const price = fefo.allocations[0]?.batch.wholesale_price ?? 0;
                            setValue(`lines.${i}.unit_price`, price);
                          }
                        }}
                      >
                        <option value="">Select product</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name_brand}</option>)}
                      </select>
                      <input type="hidden" {...register(`lines.${i}.product_name_snapshot`)} />
                      {selectedProduct ? (
                        <span className="text-[10px] text-zinc-400">{wholesaleStock} wholesale units available</span>
                      ) : null}
                      {lineErrors?.product_id ? <span className="block text-xs text-red-600">{lineErrors.product_id.message}</span> : null}
                    </label>
                    <label className="text-xs font-medium text-emerald-950">
                      Qty *
                      <input type="number" min="1" step="1" className={fc} {...register(`lines.${i}.quantity`, { valueAsNumber: true })} />
                      {lineErrors?.quantity ? <span className="block text-xs text-red-600">{lineErrors.quantity.message}</span> : null}
                    </label>
                    <label className="text-xs font-medium text-emerald-950">
                      Unit price (GHS) *
                      <input type="number" min="0" step="0.01" className={fc} {...register(`lines.${i}.unit_price`, { valueAsNumber: true })} />
                      {lineErrors?.unit_price ? <span className="block text-xs text-red-600">{lineErrors.unit_price.message}</span> : null}
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

            <div className="mt-4 grid gap-y-4 md:grid-cols-2">
              <label className="text-sm font-medium text-emerald-950">
                Discount (GHS)
                <input type="number" min="0" step="0.01" className="mt-1 h-9 w-40 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" {...register("discount_amount", { valueAsNumber: true })} />
              </label>
              <label className="text-sm font-medium text-emerald-950">
                Notes
                <input className="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" {...register("notes")} />
              </label>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-100 px-5 py-4">
          <div className="space-y-0.5 text-sm text-zinc-600">
            {watchedDiscount > 0 ? (
              <div className="flex gap-6">
                <span>Subtotal: {currency.format(subtotal)}</span>
                <span className="text-emerald-700">Discount: −{currency.format(watchedDiscount)}</span>
              </div>
            ) : null}
            <span className="text-base font-semibold text-emerald-950">Total: {currency.format(total)}</span>
            {submitError ? <p className="text-sm text-red-600 mt-1">{submitError}</p> : null}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {isSubmitting ? "Creating…" : `Create ${watchedType === "proforma" ? "proforma" : "invoice"}`}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
