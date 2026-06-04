"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  defaultPharmacyInfo,
  defaultPosSettings,
  getPharmacyInfo,
  getPosSettings,
  updatePharmacyInfo,
  updatePosSettings,
} from "@/lib/services/settings.service";
import type { PharmacyInfo, PosSettings } from "@/types";

const pharmacySchema = z.object({
  name: z.string().trim().min(2, "Pharmacy name is required"),
  tagline: z.string().trim(),
  address: z.string().trim(),
  phone: z.string().trim(),
  email: z.string().trim(),
  fda_number: z.string().trim(),
  logo_url: z.string().trim(),
});

const posSchema = z.object({
  discount_threshold_pct: z
    .number()
    .min(0, "Must be 0 or more")
    .max(100, "Cannot exceed 100"),
});

type PharmacyInput = z.infer<typeof pharmacySchema>;
type PosInput = z.infer<typeof posSchema>;

const fc =
  "mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

export function SettingsForm() {
  const { toast } = useToast();
  const [loadingPharmacy, setLoadingPharmacy] = useState(true);
  const [loadingPos, setLoadingPos] = useState(true);

  const {
    register: registerPharmacy,
    handleSubmit: handlePharmacySubmit,
    reset: resetPharmacy,
    formState: { errors: pharmacyErrors, isSubmitting: savingPharmacy },
  } = useForm<PharmacyInput>({
    resolver: zodResolver(pharmacySchema),
    defaultValues: defaultPharmacyInfo,
  });

  const {
    register: registerPos,
    handleSubmit: handlePosSubmit,
    reset: resetPos,
    formState: { errors: posErrors, isSubmitting: savingPos },
  } = useForm<PosInput>({
    resolver: zodResolver(posSchema),
    defaultValues: defaultPosSettings,
  });

  useEffect(() => {
    getPharmacyInfo()
      .then((info) => { resetPharmacy(info as PharmacyInput); })
      .catch(() => undefined)
      .finally(() => setLoadingPharmacy(false));

    getPosSettings()
      .then((pos) => { resetPos(pos); })
      .catch(() => undefined)
      .finally(() => setLoadingPos(false));
  }, [resetPharmacy, resetPos]);

  async function onPharmacySubmit(input: PharmacyInput) {
    try {
      await updatePharmacyInfo(input as PharmacyInfo);
      toast({ title: "Pharmacy info saved", description: input.name, variant: "success" });
    } catch {
      toast({ title: "Save failed", description: "Could not update pharmacy info.", variant: "error" });
    }
  }

  async function onPosSubmit(input: PosInput) {
    try {
      await updatePosSettings(input as PosSettings);
      toast({ title: "POS settings saved", description: `Discount threshold: ${input.discount_threshold_pct}%`, variant: "success" });
    } catch {
      toast({ title: "Save failed", description: "Could not update POS settings.", variant: "error" });
    }
  }

  return (
    <div className="space-y-8">
      <header className="border-b border-emerald-900/10 pb-5">
        <p className="text-xs font-semibold uppercase text-lime-700">System configuration</p>
        <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Settings</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Pharmacy information is printed on receipts. POS settings control checkout behaviour.
        </p>
      </header>

      {/* Pharmacy info */}
      <section className="rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <header className="border-b border-emerald-900/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-emerald-950">Pharmacy information</h2>
          <p className="mt-1 text-xs text-zinc-500">Appears on every printed receipt.</p>
        </header>

        {loadingPharmacy ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-10 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={handlePharmacySubmit(onPharmacySubmit)}>
            <div className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
              <Field label="Pharmacy name *" error={pharmacyErrors.name?.message}>
                <input className={fc} {...registerPharmacy("name")} />
              </Field>
              <Field label="Tagline" error={pharmacyErrors.tagline?.message}>
                <input className={fc} placeholder="e.g. Quality Medicine, Better Life" {...registerPharmacy("tagline")} />
              </Field>
              <Field label="Phone" error={pharmacyErrors.phone?.message}>
                <input className={fc} type="tel" {...registerPharmacy("phone")} />
              </Field>
              <Field label="Email" error={pharmacyErrors.email?.message}>
                <input className={fc} type="email" {...registerPharmacy("email")} />
              </Field>
              <Field label="FDA registration number" error={pharmacyErrors.fda_number?.message}>
                <input className={fc} {...registerPharmacy("fda_number")} />
              </Field>
              <Field label="Logo URL" error={pharmacyErrors.logo_url?.message}>
                <input className={fc} placeholder="/logo.jpg or https://…" {...registerPharmacy("logo_url")} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address" error={pharmacyErrors.address?.message}>
                  <input className={fc} {...registerPharmacy("address")} />
                </Field>
              </div>
            </div>
            <footer className="flex justify-end border-t border-zinc-100 px-5 py-4">
              <button
                type="submit"
                disabled={savingPharmacy}
                className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {savingPharmacy ? "Saving…" : "Save pharmacy info"}
              </button>
            </footer>
          </form>
        )}
      </section>

      {/* POS settings */}
      <section className="rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <header className="border-b border-emerald-900/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-emerald-950">Point of Sale</h2>
          <p className="mt-1 text-xs text-zinc-500">Controls checkout approval rules.</p>
        </header>

        {loadingPos ? (
          <div className="p-5">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="mt-2 h-10 w-48" />
          </div>
        ) : (
          <form onSubmit={handlePosSubmit(onPosSubmit)}>
            <div className="p-5">
              <Field label="Discount approval threshold (%)" error={posErrors.discount_threshold_pct?.message}>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="mt-1 h-10 w-32 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    {...registerPos("discount_threshold_pct", { valueAsNumber: true })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Discounts above this % require a manager role to proceed.
                  </p>
                </div>
              </Field>
            </div>
            <footer className="flex justify-end border-t border-zinc-100 px-5 py-4">
              <button
                type="submit"
                disabled={savingPos}
                className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {savingPos ? "Saving…" : "Save POS settings"}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-emerald-950">
      {label}
      {children}
      {error ? <span className="mt-1 block text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  );
}
