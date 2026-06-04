"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Plus, Search, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { createSupplier, subscribeSuppliers, updateSupplier } from "@/lib/services/supplier.service";
import { supplierSchema, type SupplierInput } from "@/lib/validation/supplier";
import type { Supplier } from "@/types";

const DEFAULTS: SupplierInput = {
  name: "",
  supplier_code: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  is_active: true,
};

export function SupplierList() {
  const { user, appUser, role } = useAuth();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const actor = user && appUser && role ? { uid: user.uid, name: appUser.name, role } : null;

  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const unsub = subscribeSuppliers(
        (data) => { setSuppliers(data); setLoading(false); },
        () => {
          setLoadError("Suppliers could not be loaded. Check Firestore access.");
          setLoading(false);
        },
      );
      return unsub;
    } catch {
      fallbackTimer = setTimeout(() => {
        setLoadError("Add Firebase credentials to .env.local.");
        setLoading(false);
      }, 0);
      return () => clearTimeout(fallbackTimer);
    }
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      const matchSearch = !term ||
        s.name.toLowerCase().includes(term) ||
        s.supplier_code?.toLowerCase().includes(term) ||
        s.contact_person?.toLowerCase().includes(term);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? s.is_active : !s.is_active);
      return matchSearch && matchStatus;
    });
  }, [suppliers, search, statusFilter]);

  function handleEdit(supplier: Supplier) {
    setEditing(supplier);
    setFormOpen(true);
  }

  function handleClose() {
    setFormOpen(false);
    setEditing(null);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Procurement</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Suppliers</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Manage supplier records. Suppliers link to GRNs, batches, and purchase orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <Plus className="h-4 w-4" />
          Add supplier
        </button>
      </header>

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, or contact"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="all">All suppliers</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <div className="flex h-10 items-center rounded-md border border-emerald-900/10 bg-white px-3 text-sm text-zinc-600">
          {filtered.length} shown
        </div>
      </div>

      <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Name / Code</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-emerald-950">{s.name}</p>
                        {s.supplier_code ? (
                          <p className="font-mono text-xs text-zinc-400">{s.supplier_code}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{s.contact_person || "—"}</td>
                      <td className="px-4 py-3 text-zinc-700">{s.phone || "—"}</td>
                      <td className="px-4 py-3 text-zinc-700">{s.email || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${s.is_active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          title="Edit supplier"
                          onClick={() => handleEdit(s)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
            <Truck className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No suppliers found</p>
            <p className="mt-1 text-sm text-zinc-500">Add your first supplier or adjust the filter.</p>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <SupplierForm supplier={editing} actor={actor} onClose={handleClose} toast={toast} />
      ) : null}
    </div>
  );
}

function SupplierForm({
  supplier,
  actor,
  onClose,
  toast,
}: {
  supplier: Supplier | null;
  actor: { uid: string; name: string; role: string } | null;
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: supplier
      ? {
          name: supplier.name,
          supplier_code: supplier.supplier_code ?? "",
          contact_person: supplier.contact_person ?? "",
          phone: supplier.phone ?? "",
          email: supplier.email ?? "",
          address: supplier.address ?? "",
          notes: supplier.notes ?? "",
          is_active: supplier.is_active,
        }
      : DEFAULTS,
  });

  async function onSubmit(input: SupplierInput) {
    setSubmitError("");
    if (!actor) { setSubmitError("Your profile is required."); return; }
    try {
      if (supplier) {
        await updateSupplier(supplier.id, input, actor);
        toast({ title: "Supplier updated", description: input.name, variant: "success" });
      } else {
        await createSupplier(input, actor);
        toast({ title: "Supplier added", description: input.name, variant: "success" });
      }
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Operation failed.";
      setSubmitError(msg);
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
            <p className="text-xs font-semibold uppercase text-lime-700">Procurement</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">
              {supplier ? "Edit supplier" : "Add supplier"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
          <Field label="Supplier name *" error={errors.name?.message}>
            <input className={fc} {...register("name")} />
          </Field>
          <Field label="Supplier code" error={errors.supplier_code?.message}>
            <input className={fc} placeholder="e.g. SUP-001" {...register("supplier_code")} />
          </Field>
          <Field label="Contact person" error={errors.contact_person?.message}>
            <input className={fc} {...register("contact_person")} />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <input className={fc} type="tel" {...register("phone")} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <input className={fc} type="email" {...register("email")} />
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
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {isSubmitting ? "Saving…" : supplier ? "Save changes" : "Add supplier"}
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
