"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useToast } from "@/components/ui/toast";
import { adjustBatchStock, recallBatch } from "@/lib/services/inventory.service";
import {
  recallSchema,
  stockAdjustmentSchema,
  type RecallInput,
  type StockAdjustmentInput,
} from "@/lib/validation/batch";
import type { Batch } from "@/types";

const number = new Intl.NumberFormat("en-GH");

const ADJUSTMENT_TYPE_LABELS: Record<StockAdjustmentInput["adjustment_type"], string> = {
  correction: "Stock count correction",
  damage: "Damaged / unusable",
  expiry_write_off: "Expiry write-off",
  other: "Other",
};

interface Actor {
  uid: string;
  name: string;
  role: string;
}

interface AdjustProps {
  mode: "adjust";
  batch: Batch;
  actor: Actor;
  onClose: () => void;
}

interface RecallProps {
  mode: "recall";
  batch: Batch;
  actor: Actor;
  onClose: () => void;
}

type Props = AdjustProps | RecallProps;

export function StockAdjustModal(props: Props) {
  const { batch, actor, onClose } = props;
  const { toast } = useToast();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">
              {props.mode === "adjust" ? "Stock adjustment" : "Batch recall"}
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">
              {props.mode === "adjust" ? "Adjust stock" : "Recall batch"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="rounded-md bg-emerald-50 mx-5 mt-4 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-950">{batch.product_name_snapshot}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">Batch {batch.batch_number}</p>
          <p className="mt-1 text-xs text-zinc-600">
            {number.format(batch.quantity_remaining)} units remaining
          </p>
        </div>

        {props.mode === "adjust" ? (
          <AdjustForm batch={batch} actor={actor} onClose={onClose} toast={toast} />
        ) : (
          <RecallForm batch={batch} actor={actor} onClose={onClose} toast={toast} />
        )}
      </div>
    </div>
  );
}

function AdjustForm({
  batch,
  actor,
  onClose,
  toast,
}: {
  batch: Batch;
  actor: Actor;
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      direction: "remove",
      quantity: 1,
      adjustment_type: "correction",
      reason: "",
    },
  });

  const direction = useWatch({ control, name: "direction" });
  const quantity = useWatch({ control, name: "quantity" }) || 0;
  const preview = direction === "add" ? batch.quantity_remaining + quantity : batch.quantity_remaining - quantity;

  async function onSubmit(input: StockAdjustmentInput) {
    setSubmitError("");
    try {
      const result = await adjustBatchStock(batch.id, input, actor);
      toast({
        title: "Stock adjusted",
        description: `${batch.product_name_snapshot} now has ${number.format(result.quantityAfter)} units.`,
        variant: "success",
      });
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Adjustment failed. Try again.";
      setSubmitError(msg);
    }
  }

  const fieldClass =
    "mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-emerald-950">
          Direction
          <select className={fieldClass} {...register("direction")}>
            <option value="add">Add units</option>
            <option value="remove">Remove units</option>
          </select>
          {errors.direction ? (
            <span className="mt-1 block text-xs font-normal text-red-600">{errors.direction.message}</span>
          ) : null}
        </label>
        <label className="text-sm font-medium text-emerald-950">
          Quantity
          <input
            type="number"
            min="1"
            step="1"
            className={fieldClass}
            {...register("quantity", { valueAsNumber: true })}
          />
          {errors.quantity ? (
            <span className="mt-1 block text-xs font-normal text-red-600">{errors.quantity.message}</span>
          ) : null}
        </label>
      </div>

      {quantity > 0 ? (
        <p className={`rounded-md px-3 py-2 text-xs font-medium ${preview < 0 ? "bg-red-50 text-red-700" : "bg-zinc-50 text-zinc-600"}`}>
          {preview < 0
            ? `Cannot remove ${quantity} — only ${batch.quantity_remaining} available.`
            : `New quantity: ${number.format(preview)} units`}
        </p>
      ) : null}

      <label className="text-sm font-medium text-emerald-950">
        Reason
        <select className={fieldClass} {...register("adjustment_type")}>
          {Object.entries(ADJUSTMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {errors.adjustment_type ? (
          <span className="mt-1 block text-xs font-normal text-red-600">{errors.adjustment_type.message}</span>
        ) : null}
      </label>

      <label className="text-sm font-medium text-emerald-950">
        Note
        <textarea
          rows={2}
          placeholder="Describe the reason for this adjustment (min 5 characters)"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          {...register("reason")}
        />
        {errors.reason ? (
          <span className="mt-1 block text-xs font-normal text-red-600">{errors.reason.message}</span>
        ) : null}
      </label>

      {submitError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || preview < 0}
          className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {isSubmitting ? "Applying…" : "Apply adjustment"}
        </button>
      </div>
    </form>
  );
}

function RecallForm({
  batch,
  actor,
  onClose,
  toast,
}: {
  batch: Batch;
  actor: Actor;
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecallInput>({
    resolver: zodResolver(recallSchema),
    defaultValues: { reason: "" },
  });

  async function onSubmit(input: RecallInput) {
    setSubmitError("");
    try {
      await recallBatch(batch.id, input.reason, actor);
      toast({
        title: "Batch recalled",
        description: `${batch.product_name_snapshot} batch ${batch.batch_number} has been quarantined.`,
        variant: "success",
      });
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Recall failed. Try again.";
      setSubmitError(msg);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-5">
      <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          Recalling this batch immediately removes it from sellable stock.{" "}
          {batch.quantity_remaining > 0
            ? `${number.format(batch.quantity_remaining)} remaining units will be written off.`
            : "The batch has no remaining units."}{" "}
          This action cannot be undone.
        </p>
      </div>

      <label className="text-sm font-medium text-emerald-950">
        Recall reason / reference
        <textarea
          rows={3}
          placeholder="e.g. Manufacturer recall notice MR-2026-001 — contamination risk"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          {...register("reason")}
        />
        {errors.reason ? (
          <span className="mt-1 block text-xs font-normal text-red-600">{errors.reason.message}</span>
        ) : null}
      </label>

      {submitError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-10 rounded-md bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {isSubmitting ? "Recalling…" : "Confirm recall"}
        </button>
      </div>
    </form>
  );
}
