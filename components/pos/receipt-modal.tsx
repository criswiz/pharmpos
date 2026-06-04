"use client";

import { Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getPharmacyInfo } from "@/lib/services/settings.service";
import type { PharmacyInfo, ReceiptData } from "@/types";

const ghsCurrency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const dateFormat = new Intl.DateTimeFormat("en-GH", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  momo: "Mobile Money",
  card: "Card",
  split: "Split payment",
};

function buildPrintHtml(receipt: ReceiptData, pharmacy: PharmacyInfo): string {
  const lines = receipt.lines
    .map(
      (line) => `
      <div class="item">
        <div class="item-name">${line.product_name}</div>
        <div class="item-detail">Batch: ${line.batch_number}</div>
        <div class="row">
          <span>${line.quantity} × ${ghsCurrency.format(line.unit_price)}</span>
          <span>${ghsCurrency.format(line.line_total)}</span>
        </div>
      </div>`,
    )
    .join("");

  const discountRow = receipt.discount_amount > 0
    ? `<div class="row"><span>Subtotal</span><span>${ghsCurrency.format(receipt.subtotal)}</span></div>
       <div class="row"><span>Discount</span><span>-${ghsCurrency.format(receipt.discount_amount)}</span></div>`
    : "";

  const paymentRows = receipt.payment_method === "split" && receipt.payment_splits?.length
    ? receipt.payment_splits.map(
        (s) => `<div class="row"><span>${PAYMENT_LABEL[s.method] ?? s.method}</span><span>${ghsCurrency.format(s.amount)}</span></div>`,
      ).join("")
    : `<div class="row"><span>Payment</span><span>${PAYMENT_LABEL[receipt.payment_method] ?? receipt.payment_method}</span></div>
       <div class="row"><span>Tendered</span><span>${ghsCurrency.format(receipt.amount_tendered)}</span></div>`;

  const changeRow =
    receipt.change > 0
      ? `<div class="row"><span>Change</span><span>${ghsCurrency.format(receipt.change)}</span></div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt ${receipt.sale_id.slice(-8).toUpperCase()}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; width: 80mm; padding: 6mm 4mm; }
  .c { text-align: center; }
  .b { font-weight: bold; }
  .sm { font-size: 9px; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; margin: 2px 0; }
  .item { margin: 4px 0; }
  .item-name { font-weight: bold; }
  .item-detail { font-size: 9px; color: #555; }
  .total-row { font-size: 13px; font-weight: bold; margin: 3px 0; }
  @media print { body { width: 80mm; } @page { margin: 0; size: 80mm auto; } }
</style>
</head>
<body>
  <div class="c b" style="font-size:13px">${pharmacy.name}</div>
  ${pharmacy.tagline ? `<div class="c sm">${pharmacy.tagline}</div>` : ""}
  ${pharmacy.address ? `<div class="c sm">${pharmacy.address}</div>` : ""}
  ${pharmacy.phone ? `<div class="c sm">Tel: ${pharmacy.phone}</div>` : ""}
  ${pharmacy.fda_number ? `<div class="c sm">FDA Reg: ${pharmacy.fda_number}</div>` : ""}
  <div class="sep"></div>
  <div class="c b">RETAIL SALE</div>
  <div class="sep"></div>
  <div class="row sm"><span>Date:</span><span>${dateFormat.format(receipt.sale_date)}</span></div>
  <div class="row sm"><span>Ref:</span><span>${receipt.sale_id.slice(-12).toUpperCase()}</span></div>
  <div class="row sm"><span>Cashier:</span><span>${receipt.cashier_name}</span></div>
  <div class="sep"></div>
  ${lines}
  <div class="sep"></div>
  ${discountRow}
  <div class="row total-row"><span>TOTAL</span><span>${ghsCurrency.format(receipt.total)}</span></div>
  <div class="sep"></div>
  ${paymentRows}
  ${changeRow}
  <div class="sep"></div>
  <div class="c" style="margin-top:6px">Thank you for your purchase.</div>
  ${pharmacy.tagline ? `<div class="c sm" style="margin-top:3px">${pharmacy.tagline}</div>` : ""}
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
}

interface Props {
  receipt: ReceiptData;
  onClose: () => void;
}

export function ReceiptModal({ receipt, onClose }: Props) {
  const [pharmacy, setPharmacy] = useState<PharmacyInfo | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    getPharmacyInfo().then(setPharmacy).catch(() => null);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handlePrint() {
    if (!pharmacy) return;
    setPrinting(true);
    try {
      const win = window.open("", "_blank", "width=420,height=700");
      if (win) {
        win.document.write(buildPrintHtml(receipt, pharmacy));
        win.document.close();
      }
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sale receipt"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90dvh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Sale completed</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Receipt</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close receipt"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 font-mono text-[11px] text-zinc-800">
            <div className="mb-3 text-center">
              <p className="text-sm font-bold text-zinc-900">{pharmacy?.name ?? "Loading…"}</p>
              {pharmacy?.tagline ? <p className="text-[10px] text-zinc-500">{pharmacy.tagline}</p> : null}
              {pharmacy?.address ? <p className="text-[10px] text-zinc-500">{pharmacy.address}</p> : null}
              {pharmacy?.phone ? <p className="text-[10px] text-zinc-500">Tel: {pharmacy.phone}</p> : null}
              {pharmacy?.fda_number ? <p className="text-[10px] text-zinc-500">FDA Reg: {pharmacy.fda_number}</p> : null}
            </div>

            <div className="my-2 border-t border-dashed border-zinc-300" />
            <div className="mb-2 text-center font-bold tracking-widest">RETAIL SALE</div>
            <div className="my-2 border-t border-dashed border-zinc-300" />

            <div className="mb-2 space-y-0.5 text-[10px]">
              <div className="flex justify-between"><span className="text-zinc-500">Date</span><span>{dateFormat.format(receipt.sale_date)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Ref</span><span>{receipt.sale_id.slice(-12).toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Cashier</span><span>{receipt.cashier_name}</span></div>
            </div>

            <div className="my-2 border-t border-dashed border-zinc-300" />

            <div className="space-y-2">
              {receipt.lines.map((line, i) => (
                <div key={i}>
                  <p className="font-semibold text-zinc-900">{line.product_name}</p>
                  <p className="text-[10px] text-zinc-400">Batch: {line.batch_number}</p>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{line.quantity} × {ghsCurrency.format(line.unit_price)}</span>
                    <span className="font-medium">{ghsCurrency.format(line.line_total)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="my-2 border-t border-dashed border-zinc-300" />

            {receipt.discount_amount > 0 ? (
              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between text-zinc-500"><span>Subtotal</span><span>{ghsCurrency.format(receipt.subtotal)}</span></div>
                <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{ghsCurrency.format(receipt.discount_amount)}</span></div>
              </div>
            ) : null}

            <div className={`flex justify-between text-sm font-bold text-zinc-900 ${receipt.discount_amount > 0 ? "mt-1" : ""}`}>
              <span>TOTAL</span>
              <span>{ghsCurrency.format(receipt.total)}</span>
            </div>

            <div className="my-2 border-t border-dashed border-zinc-300" />

            <div className="space-y-0.5 text-[10px]">
              {receipt.payment_method === "split" && receipt.payment_splits?.length ? (
                receipt.payment_splits.map((s, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-zinc-500">{PAYMENT_LABEL[s.method] ?? s.method}</span>
                    <span>{ghsCurrency.format(s.amount)}</span>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Payment</span>
                    <span>{PAYMENT_LABEL[receipt.payment_method] ?? receipt.payment_method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Tendered</span>
                    <span>{ghsCurrency.format(receipt.amount_tendered)}</span>
                  </div>
                </>
              )}
              {receipt.change > 0 ? (
                <div className="flex justify-between font-semibold">
                  <span>Change</span>
                  <span>{ghsCurrency.format(receipt.change)}</span>
                </div>
              ) : null}
            </div>

            <div className="my-3 border-t border-dashed border-zinc-300" />
            <p className="text-center text-[10px] text-zinc-500">Thank you for your purchase.</p>
          </div>
        </div>

        <div className="flex gap-3 border-t border-zinc-100 px-5 py-4">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!pharmacy || printing}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {printing ? "Opening printer…" : "Print Receipt"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
