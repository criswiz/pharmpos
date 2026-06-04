import { Activity } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function DashboardPage() {
  return (
    <ModulePage
      title="Dashboard"
      eyebrow="Operational overview"
      description="The dashboard will aggregate retail and wholesale sales, low-stock alerts, expiry risk, receivables, and recent activity."
      icon={Activity}
      stats={[
        { label: "Today's sales", value: "GHS 0.00", note: "Retail + wholesale" },
        { label: "Low stock", value: "0", note: "Below reorder threshold" },
        { label: "Expiring <30 days", value: "0", note: "Active batches only" },
        { label: "Receivables", value: "GHS 0.00", note: "Wholesale balances" },
      ]}
      actions={[
        "Wire Firestore aggregate queries for sales and receivables",
        "Add expiry and reorder widgets",
        "Render 7-day revenue trend with Recharts",
        "Show recent transactions with role-aware links",
      ]}
    />
  );
}
