import { ClipboardList } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function GrnPage() {
  return (
    <ModulePage
      title="Goods Received Notes"
      eyebrow="Receiving"
      description="GRNs will receive ordered products, capture batch and expiry details, create batch stock, and update PO status."
      icon={ClipboardList}
      actions={[
        "Create GRN form against purchase orders",
        "Capture batch number, expiry, prices, and quantity",
        "Create batch documents on save",
        "Write stock transaction and audit log entries",
      ]}
    />
  );
}
