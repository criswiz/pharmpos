"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { createCustomer, subscribeCustomers, updateCustomer } from "@/lib/services/customer.service";
import { customerSchema, type CustomerInput } from "@/lib/validation/customer";
import type { Customer } from "@/types";

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });

type TypeFilter = "all" | "retail" | "wholesale" | "both";
type StatusFilter = "all" | "active" | "inactive";

const TYPE_LABEL: Record<Customer["customer_type"], string> = {
  retail: "Retail",
  wholesale: "Wholesale",
  both: "Retail & Wholesale",
};

const TYPE_STYLE: Record<Customer["customer_type"], string> = {
  retail: "bg-emerald-50 text-emerald-700",
  wholesale: "bg-sky-50 text-sky-700",
  both: "bg-purple-50 text-purple-700",
};

const DEFAULTS: CustomerInput = {
  name: "",
  phone: "",
  email: "",
  customer_type: "wholesale",
  credit_limit: 0,
  address: "",
  notes: "",
  is_active: true,
};

export function CustomerList() {
  const { user, appUser, role } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const actor = user && appUser && role ? { uid: user.uid, name: appUser.name, role } : null;

  useEffect(() => {
    let fallback: ReturnType<typeof setTimeout> | undefined;
    try {
      return subscribeCustomers(
        (data) => { setCustomers(data); setLoading(false); },
        () => { setLoadError("Customers could not be loaded."); setLoading(false); },
      );
    } catch {
      fallback = setTimeout(() => {
        setLoadError("Add Firebase credentials to .env.local.");
        setLoading(false);
      }, 0);
      return () => clearTimeout(fallback);
    }
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((c) => {
      const matchSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.phone?.includes(term) ||
        c.email?.toLowerCase().includes(term);
      const matchType = typeFilter === "all" || c.customer_type === typeFilter;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? c.is_active : !c.is_active);
      return matchSearch && matchType && matchStatus;
    });
  }, [customers, search, typeFilter, statusFilter]);

  const overLimitCount = customers.filter(
    (c) => c.is_active && c.credit_limit > 0 && c.current_balance > c.credit_limit,
  ).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Retail and wholesale</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Customers</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Manage retail and wholesale customer accounts, credit limits, and balances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <Plus className="h-4 w-4" />
          Add customer
        </button>
      </header>

      {overLimitCount > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {overLimitCount} customer{overLimitCount === 1 ? "" : "s"} over credit limit.
        </p>
      ) : null}

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </label>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="all">All types</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
          <option value="both">Both</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <div className="flex h-10 items-center rounded-md border border-emerald-900/10 bg-white px-3 text-sm text-zinc-600">
          {filtered.length} shown
        </div>
      </div>

      <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Credit limit</th>
                <th className="px-4 py-3 font-semibold">Balance</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map((c) => {
                    const overLimit = c.credit_limit > 0 && c.current_balance > c.credit_limit;
                    return (
                      <tr key={c.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-emerald-950">{c.name}</p>
                          {c.email ? <p className="text-xs text-zinc-500">{c.email}</p> : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${TYPE_STYLE[c.customer_type]}`}>
                            {TYPE_LABEL[c.customer_type]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{c.phone || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">
                          {c.credit_limit > 0 ? currency.format(c.credit_limit) : "None"}
                        </td>
                        <td className="px-4 py-3">
                          {c.current_balance > 0 ? (
                            <span className={`font-medium ${overLimit ? "text-red-600" : "text-zinc-700"}`}>
                              {currency.format(c.current_balance)}
                              {overLimit ? " ⚠" : ""}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                            {c.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            title="Edit customer"
                            onClick={() => { setEditing(c); setFormOpen(true); }}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
            <Users className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No customers found</p>
            <p className="mt-1 text-sm text-zinc-500">Add your first customer or adjust the filters.</p>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <CustomerForm
          customer={editing}
          actor={actor}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

function CustomerForm({
  customer,
  actor,
  onClose,
  toast,
}: {
  customer: Customer | null;
  actor: { uid: string; name: string; role: string } | null;
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: customer
      ? {
          name: customer.name,
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          customer_type: customer.customer_type,
          credit_limit: customer.credit_limit,
          address: customer.address ?? "",
          notes: customer.notes ?? "",
          is_active: customer.is_active,
        }
      : DEFAULTS,
  });

  async function onSubmit(input: CustomerInput) {
    setSubmitError("");
    if (!actor) { setSubmitError("Your profile is required."); return; }
    try {
      if (customer) {
        await updateCustomer(customer.id, input, actor);
        toast({ title: "Customer updated", description: input.name, variant: "success" });
      } else {
        await createCustomer(input, actor);
        toast({ title: "Customer added", description: input.name, variant: "success" });
      }
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Operation failed.");
    }
  }

  const fc = "mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Customers</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">
              {customer ? "Edit customer" : "Add customer"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
          <Field label="Customer name *" error={errors.name?.message}>
            <input className={fc} autoFocus {...register("name")} />
          </Field>
          <Field label="Type *" error={errors.customer_type?.message}>
            <select className={fc} {...register("customer_type")}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="both">Retail &amp; Wholesale</option>
            </select>
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <input className={fc} type="tel" {...register("phone")} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <input className={fc} type="email" {...register("email")} />
          </Field>
          <Field label="Credit limit (GHS)" error={errors.credit_limit?.message}>
            <input
              className={fc}
              type="number"
              min="0"
              step="0.01"
              {...register("credit_limit", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Status" error={undefined}>
            <select className={fc} {...register("is_active", { setValueAs: (v) => v === "true" || v === true })}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Address" error={errors.address?.message}>
              <input className={fc} {...register("address")} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Notes" error={errors.notes?.message}>
              <textarea rows={2} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-700" {...register("notes")} />
            </Field>
          </div>
        </div>

        {submitError ? (
          <p className="mx-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
        ) : null}

        <footer className="flex justify-end gap-3 border-t border-zinc-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {isSubmitting ? "Saving…" : customer ? "Save changes" : "Add customer"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="text-sm font-medium text-emerald-950">
      {label}
      {children}
      {error ? <span className="mt-1 block text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  );
}
