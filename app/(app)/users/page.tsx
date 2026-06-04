import { UserRoundCog } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";

export default function UsersPage() {
  return (
    <ModulePage
      title="User Management"
      eyebrow="Owner and system admin"
      description="User management will create Firebase Auth accounts, assign roles, unlock locked accounts, reset passwords, and deactivate users."
      icon={UserRoundCog}
      actions={[
        "Create admin API route for Firebase Auth user creation",
        "Write /users and /roles records together",
        "Add unlock, reset password, and deactivate actions",
        "Record all user actions in immutable audit logs",
      ]}
    />
  );
}
