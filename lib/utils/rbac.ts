import type { Permission, UserRole } from "@/types";

export const allPermissions: Permission[] = [
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
];

export const permissionLabels: Record<Permission, string> = {
  "dashboard:read": "Dashboard",
  "pos:write": "Point of Sale",
  "wholesale:write": "Wholesale",
  "inventory:write": "Inventory",
  "purchasing:write": "Purchasing",
  "customers:write": "Customers",
  "suppliers:write": "Suppliers",
  "trace:read": "Traceability",
  "reports:read": "Reports",
  "settings:write": "Settings",
  "users:write": "User Management",
  "audit:read": "Audit Logs",
};

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

export function hasPermission(permissions: Permission[], permission: Permission) {
  return permissions.includes(permission);
}

export function normalizePermissions(
  role: UserRole,
  permissions?: Permission[] | null,
) {
  const validPermissions = new Set(allPermissions);
  const normalized = Array.from(
    new Set((permissions ?? []).filter((item) => validPermissions.has(item))),
  );

  return normalized.length > 0 ? normalized : rolePermissions[role];
}

export function formatRole(role: UserRole) {
  return role
    .split("_")
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}
