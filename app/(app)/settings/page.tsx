import { Settings } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function SettingsPage() {
  return (
    <ModulePage
      title="Settings"
      eyebrow="System configuration"
      description="Settings will hold pharmacy letterhead data, logo, bank details, POS approvals, expiry thresholds, and counter controls."
      icon={Settings}
      actions={[
        "Create pharmacy info form with logo upload",
        "Add bank details for invoice PDFs",
        "Add POS settings and discount approval threshold",
        "Restrict counter reset to system admin",
      ]}
    />
  );
}
