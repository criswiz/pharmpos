import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { normalizePermissions } from "@/lib/utils/rbac";
import type { AppUser, Permission, RoleRecord, UserRole } from "@/types";

export interface UserWithRole extends AppUser {
  role: UserRole | null;
  permissions: Permission[];
}

export function subscribeUsers(
  onData: (users: UserWithRole[]) => void,
  onError: () => void,
): () => void {
  const db = getFirebaseDb();
  let usersSnapshot: AppUser[] = [];
  let rolesSnapshot: Record<string, RoleRecord> = {};
  let usersReady = false;
  let rolesReady = false;

  function merge() {
    if (!usersReady || !rolesReady) return;
    onData(
      usersSnapshot.map((u) => ({
        ...u,
        role: rolesSnapshot[u.uid]?.role ?? null,
        permissions: rolesSnapshot[u.uid]?.role
          ? normalizePermissions(rolesSnapshot[u.uid].role, rolesSnapshot[u.uid].permissions)
          : [],
      })),
    );
  }

  const unsubUsers = onSnapshot(
    query(collection(db, "users"), orderBy("name")),
    (snap) => {
      usersSnapshot = snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as AppUser);
      usersReady = true;
      merge();
    },
    () => onError(),
  );

  const unsubRoles = onSnapshot(
    collection(db, "roles"),
    (snap) => {
      rolesSnapshot = Object.fromEntries(
        snap.docs.map((d) => [d.id, d.data() as RoleRecord]),
      );
      rolesReady = true;
      merge();
    },
    () => onError(),
  );

  return () => { unsubUsers(); unsubRoles(); };
}

async function adminFetch(
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
  idToken: string,
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/auth/admin", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string | undefined) ?? "Request failed.");
  return json;
}

export async function adminCreateUser(
  input: { name: string; email: string; role: UserRole },
  idToken: string,
): Promise<{ uid: string; resetLink: string }> {
  return adminFetch("POST", input, idToken) as Promise<{ uid: string; resetLink: string }>;
}

export async function adminUpdateRole(
  uid: string,
  role: UserRole,
  permissions: Permission[],
  idToken: string,
): Promise<void> {
  await adminFetch("PATCH", { action: "update_role", uid, role, permissions }, idToken);
}

export async function adminToggleActive(
  uid: string,
  active: boolean,
  idToken: string,
): Promise<void> {
  await adminFetch("PATCH", { action: "toggle_active", uid, active }, idToken);
}

export async function adminUnlockUser(uid: string, idToken: string): Promise<void> {
  await adminFetch("PATCH", { action: "unlock", uid }, idToken);
}

export async function adminResetPassword(uid: string, idToken: string): Promise<string> {
  const result = await adminFetch("PATCH", { action: "reset_password", uid }, idToken);
  return result.resetLink as string;
}
