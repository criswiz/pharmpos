import { Skeleton } from "@/components/ui/skeleton";

export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-[#F8FAF8] lg:flex">
      <aside className="hidden min-h-screen w-72 shrink-0 border-r border-emerald-900/10 bg-white p-5 lg:block">
        <div className="flex items-center gap-3 border-b border-emerald-900/10 pb-5">
          <Skeleton className="h-12 w-12" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <div className="mt-5 space-y-2">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          <div className="space-y-3 border-b border-emerald-900/10 pb-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-md border border-emerald-900/10 bg-white p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-4 h-7 w-32" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    </div>
  );
}
