import { BarChart3 } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function ReportsPage() {
  return (
    <ModulePage
      title="Reports"
      eyebrow="Analytics"
      description="Reports will cover sales, inventory, financials, and documents with date filters plus PDF and Excel exports."
      icon={BarChart3}
      actions={[
        "Build sales summary and payment method reports",
        "Build stock valuation, expiry, reorder, and movement reports",
        "Build receivables and margin reports",
        "Export reports with SheetJS and PDF templates",
      ]}
    />
  );
}
