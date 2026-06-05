# PharmPOS Project Memory

Last updated: 2026-06-04

## Purpose

This is the durable handoff between coding sessions. Read it before starting work
and update it after meaningful changes. Keep it concise, factual, and free of
secrets or environment values.

## Current State

- Stack: Next.js 16.2.7 App Router, React 19, TypeScript, Tailwind CSS 4, Bun,
  Firebase Authentication/Firestore/Storage/Hosting.
- Firebase configuration files, Firestore indexes, role-based rules, and storage
  rules exist.
- Authentication is implemented with Firebase email/password, PharmPOS user and
  role document hydration, RBAC permissions, protected app layout, sign-out, and
  password reset.
- The application shell, sidebar, mobile navigation, loading skeletons, and toast
  notifications are implemented.
- Inventory supports a realtime product catalogue plus batch receiving and stock
  views. Product creation and batch receipts are validated and audited.
- Batch receipts atomically create the batch, opening stock transaction, and audit
  log. The stock view shows sellable units/value, expiry risk, prices, source
  references, and filters.
- Retail POS supports barcode/name search, FEFO-aware availability and pricing, a
  persistent Zustand cart, locally parked sales, cash/MoMo/card payments, and
  atomic checkout.
- POS checkout re-reads candidate batches in a Firestore transaction, reallocates
  FEFO stock, deducts batches, and creates sale, line-item, stock-movement, and
  audit records together.
- Dashboard, customers, suppliers, reports, trace, settings, and users are
  currently scaffold/module pages rather than complete workflows.
- Git baseline: `main` at `062af8b` (`Implement batch stock management and validation features`).

## Important Decisions

- Use Bun for dependency management and project scripts.
- Read the relevant local Next.js guide in `node_modules/next/dist/docs/` before
  changing Next.js APIs or conventions.
- Keep Firestore writes auditable and use atomic batches/transactions where a
  business operation updates multiple records.
- Checkout requires an online Firestore transaction. Carts and parked sales may be
  stored locally, but stock deductions must never be queued offline.
- Retail/shared stock is used by retail POS. FEFO allocation may span multiple
  batches, and each batch allocation becomes its own sale line item.
- Treat each product/batch-number combination as unique. Expiry timestamps use the
  end of the selected calendar date so stock remains valid for the full date.
- The first OWNER or SYS_ADMIN must be bootstrapped directly in Firebase Auth with
  matching `users/{uid}` and `roles/{uid}` Firestore documents.
- Never record credentials or values from `.env`, `.env.local`, or Firebase keys
  in this file.

## Next Up

1. GRN → PO status auto-link (when GRN references a PO number, update PO to "received").
2. Shopify-style product image upload (currently logo_url is a text field).
3. Expiry status auto-update via Firestore scheduled function or client-side sync.

## Verification

- Before completing a feature, run:
  - `bun run lint`
  - `bun run typecheck`
  - `bun run build`

## Session Notes

- 2026-06-04: Created this memory file and added its maintenance instructions to
  `AGENTS.md`. No application behavior changed.
- 2026-06-04: Implemented realtime batch stock views and atomic manual batch
  receiving with validation, opening stock movements, duplicate protection, and
  audit logs. Existing Firestore rules/indexes already supported the workflow.
  Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.
- 2026-06-04: Implemented retail POS with FEFO allocation, persistent cart and
  parked sales, online atomic checkout, payment recording, stock deductions, sale
  line items, stock movements, and audit logs. Tightened Firestore rules so POS
  batch decrements must reference a new sale in the same transaction. Verified
  with `bun run lint`, `bun run typecheck`, `bun run build`, and the Firestore
  emulator.
- 2026-06-05: Wholesale orders module — the last scaffold page.
  WholesaleDocument type (proforma | invoice, draft | confirmed | partially_paid |
  paid | void), WholesaleLineItem (product, batch_id populated at confirmation),
  WholesalePaymentMethod (cash/momo/card/credit).
  wholesale.service.ts: createWholesaleDoc (proforma → no stock, invoice → FEFO
  allocate wholesale+shared batches, create saleTransactions channel:wholesale,
  deduct batches, create stockTransactions/saleLineItems, update customer balance
  via increment if credit), convertToInvoice (re-allocates FEFO from proforma
  line items and confirms), recordPayment (decrements customer balance for credit
  invoices), voidWholesaleDoc (restores unpaid credit balance on void).
  UI: document list with type/status/search filters, action buttons per row
  (Download PDF, Confirm proforma with inline payment-method picker, Record
  payment, Void for managers), create form with dynamic line items auto-priced
  from FEFO wholesale price. Invoice PDF opens a branded print window with
  letterhead, itemised table, balance due. Uses existing documents Firestore
  collection and counters/proforma + counters/invoice for year-scoped numbering.
  Verified with lint, typecheck, build.
- 2026-06-05: Reports module (4 tabs) and export utilities.
  lib/utils/export.ts: downloadCsv (PapaParse unparse + BOM for Excel, triggers
  browser download) and openPrintReport (styled HTML table in new window with
  window.print() — staff save as PDF). Added @types/papaparse dev dependency.
  Reports page: tab navigation (Sales | Stock Valuation | Expiry | GRN History).
  Sales tab: date range + channel filter → getDocs query using existing channel+
  sale_date composite index → summary stats (total, txns, avg, discounts) + daily
  breakdown table with payment method columns + CSV + PDF export.
  Stock Valuation tab: live from products+batches subscriptions, groups active
  batches per product, computes cost/retail values and earliest expiry.
  Expiry tab: live, threshold selector (7/14/30/60/90 days or expired only),
  colour-coded days-left column.
  GRN History tab: live from subscribeGrns, client-side date range filter.
  All tabs have Export CSV and Export PDF buttons.
  No Firebase Storage or Google Drive API — staff download files and file manually.
- 2026-06-05: Customers and Drug Traceability.
  Customers: full CRUD (name, phone, email, type: retail/wholesale/both, credit limit,
  current balance, address, notes, active status). Over-limit warning banner on the
  list page. subscribeCustomers (ordered by name) + createCustomer + updateCustomer
  with audit logs. Firestore rule (customers allow write: isWholesale) already existed.
  Traceability: master-detail batch lifecycle viewer. Search filters all batches in
  real-time by batch number, product name, barcode, or supplier name. Each result card
  shows quantity received/remaining, expiry date, utilisation %, supplier, GRN reference,
  cost and retail prices. Clicking a card expands an inline movement history panel
  (reuses subscribeBatchMovements) showing every receipt/sale/adjustment/recall/return
  with signed quantity changes and running balances. Limited to 50 results per search.
  Verified with lint, typecheck, build.
- 2026-06-04: Dashboard, Settings, and Void workflow.
  Dashboard: real-time stats (today's retail sales, 7-day revenue, low-stock count,
  expiry-risk count), Recharts BarChart for 7-day daily revenue, recent-sales list,
  low-stock alert panel, expiry-risk panel. Uses subscribeTodayRetailStats (channel +
  sale_date composite index already present) and subscribe7DayRevenue (sale_date
  single-field index, auto-created). Low-stock and expiry computed client-side from
  products + batches subscriptions.
  Settings: two-form page — pharmacy info (name/tagline/address/phone/email/FDA number/
  logo URL) written to settings/pharmacyInfo, POS settings (discount_threshold_pct)
  written to settings/pos. Both read and pre-fill on mount.
  Void: voidSale sets saleTransaction status to "voided" in an atomic transaction with
  audit log. POS recent-sales list shows a void button (manager-only, two-click
  confirm pattern with 4s auto-dismiss, 4s timeout). Voided sales display strikethrough
  amount + "Voided" label. Discount threshold loaded from settings/pos on POS mount
  instead of hardcoding 20%.
  Verified with lint, typecheck, build.
- 2026-06-04: Implemented route guards and user management.
  Route guard: app/(app)/layout.tsx now checks canAccess(role, requiredPermission)
  for each path after auth loads; holds a skeleton and redirects to the first
  accessible route (pos → wholesale/orders → dashboard) if unauthorized.
  Admin API extended with PATCH handler (update_role, toggle_active, unlock,
  reset_password); all operations re-verify caller is OWNER/SYS_ADMIN and
  block self-modification. shopAccessForRole helper sets shopAccess on
  role documents consistently. Users service: subscribeUsers joins users +
  roles collections in real-time (waits for both snapshots before merging).
  User management UI: table with role badge, active/locked status, last login;
  actions per row (change role modal with radio list, toggle active, unlock,
  reset password → copy-link modal); create user modal returns password reset
  link for admin to share. Gated to OWNER/SYS_ADMIN. Verified with lint, build.
- 2026-06-04: Built full procurement workflow: Suppliers, Purchase Orders, GRN.
  Suppliers: full CRUD (create/edit modal, active/inactive filter, audit logs).
  GRN: multi-line form with useFieldArray; each line creates a batch atomically via
  a single Firestore transaction that reads a year-scoped counter, checks for
  duplicate batch numbers, creates all batches + stockTransactions, then writes
  the GRN document. Counter stored at counters/grn. GRN number format: GRN-YYYY-NNN.
  PO: create with line items (product+qty+cost), status transitions via icon buttons
  (draft→sent→received, cancel at any open state). PO number: PO-YYYY-NNN via
  counters/po. PurchasingNav shared tab bar between /purchasing/orders and
  /purchasing/grn. Existing counters Firestore rule (isWholesale write) covers
  managers. batchDocumentId and dateTimestamp exported from inventory.service for
  reuse. Verified with lint, typecheck, build.
- 2026-06-04: Added discounts, split payments, and returns to the retail POS.
  Discounts (% or fixed) persist in the Zustand cart store (survives park/resume).
  Discounts above 20% are blocked for non-managers (inventory:write gate).
  Split payment mode allows up to 3 payment lines (cash/momo/card), summed against
  total. `checkoutRetailSale` handles both modes and stores payment_splits[] in the
  saleTransaction document. Returns are manager-only: `ReturnModal` fetches line
  items for a past sale, lets the manager enter per-item quantities, then calls
  `returnSaleItems` which atomically restores batch stock, creates stockTransactions
  of type "return", creates a saleReturns record, and logs an audit entry. Stock
  is NOT restored to recalled batches. `saleReturns` Firestore rule added (manager
  create only). Receipt modal updated to show discount rows and split-payment lines.
  Verified with lint, typecheck, build.
- 2026-06-04: Added batch stock adjustments, recall controls, and movement history.
  `StockAdjustModal` handles both signed corrections (correction/damage/expiry_write_off/other)
  and recall quarantine in one component. `BatchMovementsPanel` is a real-time slide-in
  panel showing all stockTransactions for a batch with type icons and running balance.
  Three icon action buttons (adjust/recall/history) added to each batch row in the table;
  adjust and recall are gated to inventory:write. Added composite Firestore index
  batch_id + created_at DESC. Verified with lint, typecheck, build.
- 2026-06-04: Added printable retail receipts and recent-sale lookup. `ReceiptData`
  is returned directly from the checkout transaction (no extra read). `ReceiptModal`
  opens a styled 80mm thermal-print window via `window.open`. Recent sales list
  subscribes in real time via `subscribeRecentRetailSales`; each row has a Receipt
  icon button that fetches line items with `getSaleReceipt` and reopens the modal.
  Added composite Firestore index `channel ASC + sale_date DESC` for the query.
  Verified with `bun run lint`, `bun run typecheck`, `bun run build`.
