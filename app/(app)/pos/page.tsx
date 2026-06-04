import { Receipt } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function PosPage() {
  return (
    <ModulePage
      title="Point of Sale"
      eyebrow="Retail workflow"
      description="Keyboard-first POS will scan/search products, select FEFO batches, validate stock, process split payments, write atomic sales, and generate receipts."
      icon={Receipt}
      stats={[
        { label: "Cart", value: "0", note: "Items ready for checkout" },
        { label: "Offline queue", value: "0", note: "Pending sync" },
        { label: "Parked sales", value: "0", note: "Stored locally" },
        { label: "Mode", value: "Retail", note: "Shared stock pool" },
      ]}
      actions={[
        "Build barcode input with enter-key scanner support",
        "Create Zustand cart with parked-sale persistence",
        "Implement FEFO add-to-cart service",
        "Use Firestore transactions for sale and batch deduction",
      ]}
    />
  );
}
