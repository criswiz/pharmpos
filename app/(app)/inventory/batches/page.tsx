import { PackageSearch } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function BatchesPage() {
  return (
    <ModulePage
      title="Batches"
      eyebrow="Stock management"
      description="Batch records are the source of truth for remaining stock, expiry, cost, retail price, wholesale price, supplier, and GRN linkage."
      icon={PackageSearch}
      actions={[
        "Create batch table by product, status, and expiry date",
        "Add stock adjustment modal with required reason",
        "Implement inter-store transfer records as stock movements",
        "Auto-flag expired batches and block them from sale",
      ]}
    />
  );
}
