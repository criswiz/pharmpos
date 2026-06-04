import { Truck } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function SuppliersPage() {
  return (
    <ModulePage
      title="Suppliers"
      eyebrow="Procurement"
      description="Supplier records will link purchase orders, GRNs, batches, purchase history, and payable reporting."
      icon={Truck}
      actions={[
        "Create supplier list and profile forms",
        "Link supplier to PO and GRN flows",
        "Surface purchase and batch history",
        "Prepare payable reporting data",
      ]}
    />
  );
}
