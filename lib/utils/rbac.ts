import type { Permission, UserRole } from "@/types";

export const rolePermissions: Record<UserRole, Permission[]> = {
  OWNER: [
    "dashboard:read",
    "pos:write",
    "wholesale:write",
    "inventory:write",
    "purchasing:write",
    "customers:write",
    "suppliers:write",
    "trace:read",
    "reports:read",
    "settings:write",
    "users:write",
    "audit:read",
  ],
  STORE_MANAGER: [
    "dashboard:read",
    "pos:write",
    "inventory:write",
    "purchasing:write",
    "customers:write",
    "suppliers:write",
    "trace:read",
    "reports:read",
    "audit:read",
  ],
  RETAIL_STAFF: ["dashboard:read", "pos:write", "trace:read"],
  WHOLESALE_STAFF: [
    "dashboard:read",
    "wholesale:write",
    "customers:write",
    "trace:read",
  ],
  SYS_ADMIN: [
    "dashboard:read",
    "inventory:write",
    "purchasing:write",
    "customers:write",
    "suppliers:write",
    "trace:read",
    "reports:read",
    "settings:write",
    "users:write",
    "audit:read",
  ],
};

export function canAccess(role: UserRole | null, permission: Permission) {
  return role ? rolePermissions[role].includes(permission) : false;
}

export function formatRole(role: UserRole) {
  return role
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}
