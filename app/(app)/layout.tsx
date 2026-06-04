"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { useAuth } from "@/lib/hooks/useAuth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  if (loading) {
    return <AppShellSkeleton />;
  }

  if (!user) {
    return null;
  }

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
