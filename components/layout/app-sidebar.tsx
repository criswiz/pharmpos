"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  UserRoundCog,
} from "lucide-react";
import { formatRole, hasPermission } from "@/lib/utils/rbac";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Permission } from "@/types";

const navItems: Array<{
  href: string;
  label: string;
  permission: Permission;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { href: "/dashboard", label: "Dashboard", permission: "dashboard:read", icon: LayoutDashboard },
  { href: "/pos", label: "Point of Sale", permission: "pos:write", icon: ShoppingCart },
  { href: "/wholesale/orders", label: "Wholesale", permission: "wholesale:write", icon: FileText },
  { href: "/inventory/products", label: "Inventory", permission: "inventory:write", icon: Boxes },
  { href: "/purchasing/orders", label: "Purchase Orders", permission: "purchasing:write", icon: ClipboardList },
  { href: "/customers", label: "Customers", permission: "customers:write", icon: Users },
  { href: "/suppliers", label: "Suppliers", permission: "suppliers:write", icon: Truck },
  { href: "/trace", label: "Traceability", permission: "trace:read", icon: PackageSearch },
  { href: "/reports", label: "Reports", permission: "reports:read", icon: BarChart3 },
  { href: "/settings", label: "Settings", permission: "settings:write", icon: Settings },
  { href: "/users", label: "User Management", permission: "users:write", icon: UserRoundCog },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { appUser, role, permissions, signOut } = useAuth();

  const visibleItems = navItems.filter((item) => hasPermission(permissions, item.permission));

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-emerald-900/10 bg-white lg:flex lg:flex-col">
      <div className="border-b border-emerald-900/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-md border border-emerald-900/10 bg-lime-50">
            <Image src="/desh-logo.jpg" alt="Desh Chemists Ltd" fill sizes="48px" className="object-cover object-left" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-950">Desh Chemists Ltd</p>
            <p className="text-xs text-lime-700">Quality Medicine, Better Life</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
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
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-emerald-950 transition hover:bg-emerald-50",
                active && "bg-emerald-700 text-white hover:bg-emerald-700",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-emerald-900/10 p-4">
        <div className="mb-3">
          <p className="text-sm font-medium text-emerald-950">{appUser?.name ?? "Signed in"}</p>
          <p className="text-xs text-zinc-500">{role ? formatRole(role) : "Role pending"}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-900/15 text-sm font-medium text-emerald-950 hover:bg-emerald-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
