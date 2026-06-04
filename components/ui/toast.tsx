"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

type ToastVariant = "success" | "error" | "info";

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastInput {
  id: number;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const variantStyles: Record<ToastVariant, string> = {
  success: "border-emerald-200 bg-white text-emerald-950",
  error: "border-red-200 bg-white text-red-950",
  info: "border-zinc-200 bg-white text-zinc-950",
};

const variantIcons = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = Date.now() + Math.random();
      const item: ToastItem = {
        ...input,
        id,
        variant: input.variant ?? "info",
      };

      setToasts((current) => [...current.slice(-3), item]);
      window.setTimeout(() => dismiss(id), 5500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(390px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((item) => {
          const Icon = variantIcons[item.variant];

          return (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-md border p-4 shadow-lg",
                variantStyles[item.variant],
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  item.variant === "success" && "text-emerald-700",
                  item.variant === "error" && "text-red-600",
                  item.variant === "info" && "text-zinc-600",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description ? (
                  <p className="mt-1 text-sm leading-5 opacity-75">{item.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                title="Dismiss"
                onClick={() => dismiss(item.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
