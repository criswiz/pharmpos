"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const items = [
  { href: "/inventory/products", label: "Products" },
  { href: "/inventory/batches", label: "Batches & stock" },
];

export function InventoryNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-emerald-900/10 pb-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-50",
            pathname.startsWith(item.href) && "bg-emerald-700 text-white hover:bg-emerald-700",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
