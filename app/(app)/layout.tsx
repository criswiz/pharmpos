"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { useAuth } from "@/lib/hooks/useAuth";
import { canAccess } from "@/lib/utils/rbac";
import type { Permission } from "@/types";

// Map path prefixes to the permission required to view them.
// /dashboard is omitted — dashboard:read is held by every role.
const PATH_PERMISSIONS: Array<[string, Permission]> = [
  ["/pos", "pos:write"],
  ["/wholesale", "wholesale:write"],
  ["/inventory", "inventory:write"],
  ["/purchasing", "purchasing:write"],
  ["/customers", "customers:write"],
  ["/suppliers", "suppliers:write"],
  ["/trace", "trace:read"],
  ["/reports", "reports:read"],
  ["/settings", "settings:write"],
  ["/users", "users:write"],
];

function getRequiredPermission(pathname: string): Permission | null {
  for (const [prefix, permission] of PATH_PERMISSIONS) {
    if (pathname.startsWith(prefix)) return permission;
  }
  return null;
}

function getFallbackPath(role: string | null): string {
  if (canAccess(role as never, "pos:write")) return "/pos";
  if (canAccess(role as never, "wholesale:write")) return "/wholesale/orders";
  return "/dashboard";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }

    const required = getRequiredPermission(pathname);
    if (required && !canAccess(role, required)) {
      router.replace(getFallbackPath(role));
    }
  }, [loading, user, role, pathname, router]);

  if (loading) return <AppShellSkeleton />;
  if (!user) return null;

  // Hold children until the redirect resolves to avoid a flash of forbidden content.
  const required = getRequiredPermission(pathname);
  if (required && !canAccess(role, required)) return <AppShellSkeleton />;

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
