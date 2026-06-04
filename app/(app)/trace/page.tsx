import { PackageSearch } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function TracePage() {
  return (
    <ModulePage
      title="Drug Traceability"
      eyebrow="Batch lookup"
      description="Traceability will search by product barcode or batch number, show original purchase details, and list all retail or wholesale sales tied to the batch."
      icon={PackageSearch}
      actions={[
        "Query batches by batch number or product barcode",
        "Join sale line items with sale transactions",
        "Show purchase source, supplier, GRN, and quantity received",
        "Add serialised item barcode support for flagged products",
      ]}
    />
  );
}
