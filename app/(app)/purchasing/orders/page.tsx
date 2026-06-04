import { ClipboardList } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function PurchaseOrdersPage() {
  return (
    <ModulePage
      title="Purchase Orders"
      eyebrow="Reorder management"
      description="Purchase orders will be generated from reorder candidates, sent to suppliers, and reconciled through goods received notes."
      icon={ClipboardList}
      actions={[
        "Generate PO numbers in year-scoped sequence",
        "Select products below reorder threshold",
        "Track draft, sent, partial, received, and cancelled states",
        "Link each received line to GRN-created batches",
      ]}
    />
  );
}
