# PharmPOS

Pharmacy management and point-of-sale system for Desh Chemists Ltd.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Bun for package management and scripts
- Firebase Authentication, Firestore, Storage, and Hosting
- React Hook Form + Zod, Zustand, TanStack Table, Recharts, SheetJS, React PDF

## Local Setup

1. Create a Firebase project.
2. Enable Email/Password authentication.
3. Create Firestore and Firebase Storage.
4. Copy `.env.example` to `.env.local` and enter the Firebase web/admin credentials.
5. Install and run with bun:

```bash
bun install
bun run dev
```

## Checks

```bash
bun run lint
bun run typecheck
bun run build
```

## Firebase Files

- `firestore.rules`: role-based collection access and immutable audit logs
- `firestore.indexes.json`: initial compound query indexes
- `storage.rules`: authenticated file access baseline
- `firebase.json`: Firestore, Storage, and Hosting configuration

The first OWNER or SYS_ADMIN account must be bootstrapped directly in Firebase Auth,
with matching `/users/{uid}` and `/roles/{uid}` Firestore documents.
