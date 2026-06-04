import type { Batch } from "@/types";

function toDate(value: Batch["expiry_date"]) {
  return value instanceof Date ? value : value.toDate();
}

export interface FefoAllocation {
  batch: Batch;
  quantity: number;
}

export interface FefoResult {
  allocations: FefoAllocation[];
  available: number;
  fulfilled: boolean;
  requested: number;
}

export function sellableFefoBatches(
  batches: Batch[],
  shopContexts: Batch["shop_context"][] = ["retail", "shared"],
  now = new Date(),
) {
  return batches
    .filter((batch) => {
      const expiry = toDate(batch.expiry_date);
      return (
        batch.status === "active" &&
        batch.quantity_remaining > 0 &&
        expiry > now &&
        shopContexts.includes(batch.shop_context)
      );
    })
    .sort((a, b) => {
      const expiryDifference = toDate(a.expiry_date).getTime() - toDate(b.expiry_date).getTime();
      return expiryDifference || a.batch_number.localeCompare(b.batch_number);
    });
}

export function allocateFefoStock(
  batches: Batch[],
  requested: number,
  shopContexts: Batch["shop_context"][] = ["retail", "shared"],
  now = new Date(),
): FefoResult {
  const eligibleBatches = sellableFefoBatches(batches, shopContexts, now);
  const available = eligibleBatches.reduce(
    (total, batch) => total + batch.quantity_remaining,
    0,
  );
  let remaining = Math.max(0, requested);
  const allocations: FefoAllocation[] = [];

  for (const batch of eligibleBatches) {
    if (remaining === 0) {
      break;
    }

    const quantity = Math.min(remaining, batch.quantity_remaining);
    allocations.push({ batch, quantity });
    remaining -= quantity;
  }

  return {
    allocations,
    available,
    fulfilled: requested > 0 && remaining === 0,
    requested,
  };
}

export function selectFefoBatch(batches: Batch[]) {
  return sellableFefoBatches(batches)[0];
}
