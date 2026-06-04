import type { Batch } from "@/types";

function toDate(value: Batch["expiry_date"]) {
  return value instanceof Date ? value : value.toDate();
}

export function selectFefoBatch(batches: Batch[]) {
  const now = new Date();

  return batches
    .filter((batch) => {
      const expiry = toDate(batch.expiry_date);
      return (
        batch.status === "active" &&
        batch.quantity_remaining > 0 &&
        expiry > now
      );
    })
    .sort((a, b) => toDate(a.expiry_date).getTime() - toDate(b.expiry_date).getTime())[0];
}
