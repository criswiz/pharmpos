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

1. Add discounts/approval thresholds, split payments, returns, and void workflows.
2. Add batch stock adjustments, recall controls, and movement history.
3. Build suppliers and full purchase order/GRN workflows around batch receiving.
4. Replace scaffold dashboard metrics with Firestore-backed aggregates.

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
- 2026-06-04: Added printable retail receipts and recent-sale lookup. `ReceiptData`
  is returned directly from the checkout transaction (no extra read). `ReceiptModal`
  opens a styled 80mm thermal-print window via `window.open`. Recent sales list
  subscribes in real time via `subscribeRecentRetailSales`; each row has a Receipt
  icon button that fetches line items with `getSaleReceipt` and reopens the modal.
  Added composite Firestore index `channel ASC + sale_date DESC` for the query.
  Verified with `bun run lint`, `bun run typecheck`, `bun run build`.
