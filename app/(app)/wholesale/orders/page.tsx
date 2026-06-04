import { FileText } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function WholesaleOrdersPage() {
  return (
    <ModulePage
      title="Wholesale Orders"
      eyebrow="Documents"
      description="Wholesale will manage customer accounts, proformas, invoices, waybills, credit limits, payments, and linked PDF documents."
      icon={FileText}
      stats={[
        { label: "Draft proformas", value: "0", note: "No stock deducted" },
        { label: "Open invoices", value: "0", note: "Stock deducted" },
        { label: "Waybills", value: "0", note: "Ready for dispatch" },
        { label: "Credit warnings", value: "0", note: "Over-limit accounts" },
      ]}
      actions={[
        "Add customer picker and line-item builder",
        "Create document counters with transaction increments",
        "Convert proforma to invoice atomically",
        "Generate waybill and Desh letterhead PDF",
      ]}
    />
  );
}
