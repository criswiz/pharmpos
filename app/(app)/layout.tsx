"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { useAuth } from "@/lib/hooks/useAuth";
import { canViewInventory, hasPermission } from "@/lib/utils/rbac";
import type { Permission } from "@/types";

// Map path prefixes to the permission required to view them.
// /dashboard is omitted — dashboard:read is held by every role.
const PATH_ACCESS: Array<[
  string,
  (permissions: Permission[]) => boolean,
]> = [
  ["/pos", (permissions) => hasPermission(permissions, "pos:write")],
  ["/wholesale", (permissions) => hasPermission(permissions, "wholesale:write")],
  ["/inventory", canViewInventory],
  ["/purchasing", (permissions) => hasPermission(permissions, "purchasing:write")],
  ["/customers", (permissions) => hasPermission(permissions, "customers:write")],
  ["/suppliers", (permissions) => hasPermission(permissions, "suppliers:write")],
  ["/trace", (permissions) => hasPermission(permissions, "trace:read")],
  ["/reports", (permissions) => hasPermission(permissions, "reports:read")],
  ["/settings", (permissions) => hasPermission(permissions, "settings:write")],
  ["/users", (permissions) => hasPermission(permissions, "users:write")],
];

function canAccessPath(pathname: string, permissions: Permission[]) {
  for (const [prefix, canAccess] of PATH_ACCESS) {
    if (pathname.startsWith(prefix)) return canAccess(permissions);
  }
  return true;
}

function getFallbackPath(permissions: Permission[]): string {
  if (hasPermission(permissions, "pos:write")) return "/pos";
  if (hasPermission(permissions, "wholesale:write")) return "/wholesale/orders";
  return "/dashboard";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, permissions, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }

    if (!canAccessPath(pathname, permissions)) {
      router.replace(getFallbackPath(permissions));
    }
  }, [loading, user, permissions, pathname, router]);

  if (loading) return <AppShellSkeleton />;
  if (!user) return null;

  // Hold children until the redirect resolves to avoid a flash of forbidden content.
  if (!canAccessPath(pathname, permissions)) return <AppShellSkeleton />;

  return (
    <div className="min-h-screen bg-[#F8FAF8] lg:flex">
      <AppSidebar />
      <div className="min-w-0 flex-1 pb-20 lg:pb-0">
        <header className="sticky top-0 z-10 border-b border-emerald-900/10 bg-[#F8FAF8]/95 px-4 py-3 backdrop-blur lg:hidden">
          <p className="text-sm font-semibold text-emerald-950">PharmPOS</p>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
