"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, PackagePlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { createProduct, subscribeProducts } from "@/lib/services/inventory.service";
import { productSchema, type ProductInput } from "@/lib/validation/product";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { InventoryNav } from "@/components/inventory/inventory-nav";
import type { Product } from "@/types";

const defaults: ProductInput = {
  name_generic: "",
  name_brand: "",
  category: "",
  barcode_primary: "",
  barcode_internal: "",
  unit_of_measure: "tablet",
  pack_size: "",
  smallest_unit: "tablet",
  manufacturer: "",
  country_of_origin: "",
  fda_registration_number: "",
  storage_conditions: "room_temp",
  reorder_threshold: 0,
  image_url: "",
  is_active: true,
};

export function ProductCatalogue() {
  const { user, appUser, role } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let unsubscribe = () => {};
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      unsubscribe = subscribeProducts(
        (nextProducts) => {
          setProducts(nextProducts);
          setLoading(false);
          setLoadError("");
        },
        (error) => {
          const message = error.message.includes("offline")
            ? "Products are unavailable because Firestore is offline."
            : "Products could not be loaded. Check Firestore access and indexes.";
          setLoadError(message);
          toast({ title: "Could not load products", description: message, variant: "error" });
          setLoading(false);
        },
      );
    } catch {
      fallbackTimer = setTimeout(() => {
        const message = "Add Firebase credentials to .env.local to connect the product catalogue.";
        setLoadError(message);
        toast({ title: "Firebase is not configured", description: message, variant: "error" });
        setLoading(false);
      }, 0);
    }

    return () => {
      unsubscribe();
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
    };
  }, [toast]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).sort(),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory = category === "all" || product.category === category;
      const matchesSearch =
        !term ||
        product.name_generic.toLowerCase().includes(term) ||
        product.name_brand.toLowerCase().includes(term) ||
        product.barcode_primary.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term);

      return matchesCategory && matchesSearch;
    });
  }, [category, products, search]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Inventory</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Product Catalogue</h1>
          <p className="mt-2 text-sm text-zinc-600">Manage medicine identity, barcodes, packs, storage, and reorder thresholds.</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <PackagePlus className="h-4 w-4" />
          Add product
        </button>
      </header>

      <InventoryNav />

      <section className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, barcode, or category"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="all">All categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <div className="flex h-10 items-center rounded-md border border-emerald-900/10 bg-white px-3 text-sm text-zinc-600">
          {filteredProducts.length} products
        </div>
      </section>

      {loadError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{loadError}</p>
      ) : null}

      <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Barcode</th>
                <th className="px-4 py-3 font-semibold">Pack</th>
                <th className="px-4 py-3 font-semibold">Storage</th>
                <th className="px-4 py-3 font-semibold">Reorder at</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? <ProductRowsSkeleton /> : null}
              {!loading ? filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-emerald-950">{product.name_brand}</p>
                    <p className="text-xs text-zinc-500">{product.name_generic}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{product.category}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-700">{product.barcode_primary}</td>
                  <td className="px-4 py-3 text-zinc-700">{product.pack_size}</td>
                  <td className="px-4 py-3 text-zinc-700">{product.storage_conditions.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 text-zinc-700">{product.reorder_threshold}</td>
                  <td className="px-4 py-3">
                    <span className={product.is_active ? "text-emerald-700" : "text-zinc-500"}>
                      {product.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>

        {!loading && filteredProducts.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
            <Boxes className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No products found</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">Add the first product or adjust the current search and category filters.</p>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <ProductForm
          onClose={() => setFormOpen(false)}
          actor={user && appUser && role ? { uid: user.uid, name: appUser.name, role } : null}
        />
      ) : null}
    </div>
  );
}

function ProductForm({
  onClose,
  actor,
}: {
  onClose: () => void;
  actor: { uid: string; name: string; role: string } | null;
}) {
  const [submitError, setSubmitError] = useState("");
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: ProductInput) {
    setSubmitError("");

    if (!actor) {
      const message = "Your user profile and role are required before adding products.";
      setSubmitError(message);
      toast({ title: "Product not saved", description: message, variant: "error" });
      return;
    }

    try {
      await createProduct(values, actor);
      toast({
        title: "Product created",
        description: `${values.name_brand} was added to the catalogue.`,
        variant: "success",
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error && error.message.includes("offline")
        ? "Product could not be created because Firestore is offline."
        : "Product could not be created. Check Firebase configuration and permissions.";
      setSubmitError(message);
      toast({ title: "Product not saved", description: message, variant: "error" });
    }
  }

  const fieldClass = "mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-md bg-white shadow-xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-emerald-900/10 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Inventory</p>
            <h2 className="mt-1 text-lg font-semibold text-emerald-950">Add product</h2>
          </div>
          <button type="button" onClick={onClose} title="Close" className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 hover:bg-zinc-50">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
          <Field label="Generic name" error={errors.name_generic?.message}>
            <input className={fieldClass} {...register("name_generic")} />
          </Field>
          <Field label="Brand name" error={errors.name_brand?.message}>
            <input className={fieldClass} {...register("name_brand")} />
          </Field>
          <Field label="Category" error={errors.category?.message}>
            <input className={fieldClass} {...register("category")} />
          </Field>
          <Field label="Primary barcode" error={errors.barcode_primary?.message}>
            <input className={fieldClass} {...register("barcode_primary")} />
          </Field>
          <Field label="Internal barcode" error={errors.barcode_internal?.message}>
            <input className={fieldClass} {...register("barcode_internal")} />
          </Field>
          <Field label="Unit of measure" error={errors.unit_of_measure?.message}>
            <select className={fieldClass} {...register("unit_of_measure")}>
              <option value="tablet">Tablet</option>
              <option value="capsule">Capsule</option>
              <option value="bottle">Bottle</option>
              <option value="sachet">Sachet</option>
              <option value="carton">Carton</option>
            </select>
          </Field>
          <Field label="Pack size" error={errors.pack_size?.message}>
            <input className={fieldClass} placeholder="e.g. 10 x 10 tablets" {...register("pack_size")} />
          </Field>
          <Field label="Smallest unit" error={errors.smallest_unit?.message}>
            <input className={fieldClass} {...register("smallest_unit")} />
          </Field>
          <Field label="Manufacturer" error={errors.manufacturer?.message}>
            <input className={fieldClass} {...register("manufacturer")} />
          </Field>
          <Field label="Country of origin" error={errors.country_of_origin?.message}>
            <input className={fieldClass} {...register("country_of_origin")} />
          </Field>
          <Field label="FDA registration number" error={errors.fda_registration_number?.message}>
            <input className={fieldClass} {...register("fda_registration_number")} />
          </Field>
          <Field label="Storage conditions" error={errors.storage_conditions?.message}>
            <select className={fieldClass} {...register("storage_conditions")}>
              <option value="room_temp">Room temperature</option>
              <option value="cool_dry">Cool and dry</option>
              <option value="refrigerate">Refrigerate</option>
            </select>
          </Field>
          <Field label="Reorder threshold" error={errors.reorder_threshold?.message}>
            <input type="number" min="0" className={fieldClass} {...register("reorder_threshold", { valueAsNumber: true })} />
          </Field>
          <Field label="Image URL" error={errors.image_url?.message}>
            <input type="url" className={fieldClass} {...register("image_url")} />
          </Field>
          <label className="flex items-center gap-3 text-sm font-medium text-emerald-950">
            <input type="checkbox" className="h-4 w-4 accent-emerald-700" {...register("is_active")} />
            Product is active
          </label>
        </div>

        {submitError ? <p className="mx-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p> : null}

        <footer className="mt-5 flex justify-end gap-3 border-t border-emerald-900/10 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-70">
            {isSubmitting ? "Saving..." : "Save product"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ProductRowsSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <tr key={index}>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-2 h-3 w-24" />
          </td>
          {Array.from({ length: 6 }).map((__, cellIndex) => (
            <td key={cellIndex} className="px-4 py-3">
              <Skeleton className="h-4 w-20" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm font-medium text-emerald-950">
      {label}
      {children}
      {error ? <span className="mt-1 block text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  );
}
