"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, FileText, LayoutDashboard, PackageSearch, ShoppingCart } from "lucide-react";
import { hasPermission } from "@/lib/utils/rbac";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Permission } from "@/types";

const items: Array<{
  href: string;
  label: string;
  permission: Permission;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { href: "/dashboard", label: "Home", permission: "dashboard:read", icon: LayoutDashboard },
  { href: "/pos", label: "POS", permission: "pos:write", icon: ShoppingCart },
  { href: "/wholesale/orders", label: "Wholesale", permission: "wholesale:write", icon: FileText },
  { href: "/inventory/products", label: "Stock", permission: "inventory:write", icon: Boxes },
  { href: "/trace", label: "Trace", permission: "trace:read", icon: PackageSearch },
];

export function MobileNav() {
  const pathname = usePathname();
  const { permissions } = useAuth();
  const visibleItems = items.filter((item) => hasPermission(permissions, item.permission));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-emerald-900/10 bg-white px-2 py-2 lg:hidden">
      <div className="grid grid-cols-5 gap-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === "/inventory/products" && pathname.startsWith("/inventory/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-emerald-950",
                active && "bg-emerald-700 text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
