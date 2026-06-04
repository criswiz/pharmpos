import { Users } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function CustomersPage() {
  return (
    <ModulePage
      title="Customers"
      eyebrow="Retail and wholesale"
      description="Customer records will support wholesale account details, balances, credit limits, status flags, and document history."
      icon={Users}
      actions={[
        "Build wholesale customer list with credit-status filters",
        "Add customer detail with balances and linked documents",
        "Restrict credit limit edits to owner role",
        "Flag over-limit balances clearly",
      ]}
    />
  );
}
