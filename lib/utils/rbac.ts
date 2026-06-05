import type { Permission, UserRole } from "@/types";

export const allPermissions: Permission[] = [
  "dashboard:read",
  "pos:write",
  "inventory:read",
  "wholesale:write",
  "inventory:write",
  "products:write",
  "stock:receive:retail",
  "stock:receive:wholesale",
  "stock:receive:shared",
  "stock:adjust",
  "stock:recall",
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
  "inventory:read": "Inventory View",
  "wholesale:write": "Wholesale",
  "inventory:write": "Inventory Full Access",
  "products:write": "Add Products",
  "stock:receive:retail": "Receive Retail Stock",
  "stock:receive:wholesale": "Receive Wholesale Stock",
  "stock:receive:shared": "Receive Shared Stock",
  "stock:adjust": "Adjust Stock",
  "stock:recall": "Recall Stock",
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
    "inventory:read",
    "inventory:write",
    "products:write",
    "stock:receive:retail",
    "stock:receive:wholesale",
    "stock:receive:shared",
    "stock:adjust",
    "stock:recall",
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
    "wholesale:write",
    "inventory:read",
    "products:write",
    "stock:receive:retail",
    "stock:receive:wholesale",
    "stock:receive:shared",
    "stock:adjust",
    "stock:recall",
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
    "inventory:read",
    "inventory:write",
    "products:write",
    "stock:receive:retail",
    "stock:receive:wholesale",
    "stock:receive:shared",
    "stock:adjust",
    "stock:recall",
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

export function hasAnyPermission(permissions: Permission[], options: Permission[]) {
  return options.some((permission) => hasPermission(permissions, permission));
}

export function canViewInventory(permissions: Permission[]) {
  return hasAnyPermission(permissions, [
    "inventory:read",
    "inventory:write",
    "products:write",
    "stock:receive:retail",
    "stock:receive:wholesale",
    "stock:receive:shared",
    "stock:adjust",
    "stock:recall",
  ]);
}

export function canWriteProducts(permissions: Permission[]) {
  return hasAnyPermission(permissions, ["inventory:write", "products:write"]);
}

export type StockContext = "retail" | "wholesale" | "shared";

const stockReceivePermissions: Record<StockContext, Permission> = {
  retail: "stock:receive:retail",
  wholesale: "stock:receive:wholesale",
  shared: "stock:receive:shared",
};

export function canReceiveStockContext(
  permissions: Permission[],
  context: StockContext,
) {
  return hasAnyPermission(permissions, [
    "inventory:write",
    stockReceivePermissions[context],
  ]);
}

export function allowedStockContexts(permissions: Permission[]) {
  return (["shared", "retail", "wholesale"] as StockContext[]).filter((context) =>
    canReceiveStockContext(permissions, context),
  );
}

export function canAdjustStock(permissions: Permission[]) {
  return hasAnyPermission(permissions, ["inventory:write", "stock:adjust"]);
}

export function canRecallStock(permissions: Permission[]) {
  return hasAnyPermission(permissions, ["inventory:write", "stock:recall"]);
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
