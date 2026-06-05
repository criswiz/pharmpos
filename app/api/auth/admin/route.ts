import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { allPermissions, normalizePermissions, rolePermissions } from "@/lib/utils/rbac";
import type { Permission } from "@/types";

const ROLE_ENUM = z.enum(["OWNER", "STORE_MANAGER", "RETAIL_STAFF", "WHOLESALE_STAFF", "SYS_ADMIN"]);
const permissionSchema = z.custom<Permission>(
  (value) => typeof value === "string" && allPermissions.includes(value as Permission),
);

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: ROLE_ENUM,
});

const updateUserSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_role"),
    uid: z.string().min(1),
    role: ROLE_ENUM,
    permissions: z.array(permissionSchema).min(1).optional(),
  }),
  z.object({ action: z.literal("toggle_active"), uid: z.string().min(1), active: z.boolean() }),
  z.object({ action: z.literal("unlock"), uid: z.string().min(1) }),
  z.object({ action: z.literal("reset_password"), uid: z.string().min(1) }),
]);

async function verifyAdmin(request: Request) {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) throw Object.assign(new Error("Missing authorization token"), { status: 401 });

  const decoded = await adminAuth.verifyIdToken(token);
  const roleSnap = await adminDb.collection("roles").doc(decoded.uid).get();
  const roleRecord = roleSnap.data();
  const role = ROLE_ENUM.safeParse(roleRecord?.role);
  const permissions = role.success
    ? normalizePermissions(role.data, roleRecord?.permissions as Permission[] | undefined)
    : [];

  if (!role.success || (!["OWNER", "SYS_ADMIN"].includes(role.data) && !permissions.includes("users:write"))) {
    throw Object.assign(new Error("Insufficient permission"), { status: 403 });
  }

  return { uid: decoded.uid, role: role.data, permissions };
}

function shopAccessForRole(role: z.infer<typeof ROLE_ENUM>) {
  if (role === "RETAIL_STAFF") return ["retail"];
  if (role === "WHOLESALE_STAFF") return ["wholesale"];
  return ["retail", "wholesale", "shared"];
}

function shopAccessForPermissions(permissions: Permission[]) {
  const access = new Set<"retail" | "wholesale" | "shared">();
  if (permissions.includes("pos:write")) access.add("retail");
  if (permissions.includes("wholesale:write")) access.add("wholesale");
  if (permissions.some((permission) => !["pos:write", "wholesale:write"].includes(permission))) {
    access.add("shared");
  }
  return Array.from(access);
}

export async function POST(request: Request) {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  try {
    await verifyAdmin(request);
  } catch (error) {
    const err = error as { message: string; status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const body = createUserSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid user payload" }, { status: 400 });

  const { name, email, role } = body.data;

  try {
    const user = await adminAuth.createUser({
      displayName: name,
      email,
      emailVerified: false,
      disabled: false,
    });

    const now = new Date();
    await adminDb.runTransaction(async (transaction) => {
      transaction.set(adminDb.collection("users").doc(user.uid), {
        uid: user.uid,
        name,
        email,
        active: true,
        locked: false,
        failed_attempts: 0,
        isFirstLogin: true,
        created_at: now,
      });

      transaction.set(adminDb.collection("roles").doc(user.uid), {
        role,
        permissions: rolePermissions[role],
        shopAccess: shopAccessForRole(role),
      });

      transaction.set(adminDb.collection("auditLogs").doc(), {
        timestamp: now,
        user_id: "system",
        user_name_snapshot: "System",
        user_role_snapshot: "SYS_ADMIN",
        action: "USER_CREATED",
        entity_type: "user",
        entity_id: user.uid,
        details: { name, email, role },
      });
    });

    const resetLink = await adminAuth.generatePasswordResetLink(email);
    return NextResponse.json({ uid: user.uid, resetLink });
  } catch (error) {
    const message = error instanceof Error ? error.message : "User creation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  let requesterUid: string;
  try {
    const admin = await verifyAdmin(request);
    requesterUid = admin.uid;
  } catch (error) {
    const err = error as { message: string; status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const body = updateUserSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const data = body.data;

  if (data.uid === requesterUid) {
    return NextResponse.json({ error: "You cannot modify your own account from this interface." }, { status: 403 });
  }

  try {
    const now = new Date();

    switch (data.action) {
      case "update_role": {
        const permissions = normalizePermissions(data.role, data.permissions);
        await adminDb.collection("roles").doc(data.uid).update({
          role: data.role,
          permissions,
          shopAccess: shopAccessForPermissions(permissions),
        });
        await adminDb.collection("auditLogs").add({
          timestamp: now,
          user_id: requesterUid,
          user_name_snapshot: "Admin",
          user_role_snapshot: "SYS_ADMIN",
          action: "USER_ROLE_CHANGED",
          entity_type: "user",
          entity_id: data.uid,
          details: { new_role: data.role, permissions },
        });
        return NextResponse.json({ success: true });
      }

      case "toggle_active": {
        await Promise.all([
          adminAuth.updateUser(data.uid, { disabled: !data.active }),
          adminDb.collection("users").doc(data.uid).update({ active: data.active }),
        ]);
        await adminDb.collection("auditLogs").add({
          timestamp: now,
          user_id: requesterUid,
          user_name_snapshot: "Admin",
          user_role_snapshot: "SYS_ADMIN",
          action: data.active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
          entity_type: "user",
          entity_id: data.uid,
          details: { active: data.active },
        });
        return NextResponse.json({ success: true });
      }

      case "unlock": {
        await adminDb.collection("users").doc(data.uid).update({
          locked: false,
          failed_attempts: 0,
        });
        await adminDb.collection("auditLogs").add({
          timestamp: now,
          user_id: requesterUid,
          user_name_snapshot: "Admin",
          user_role_snapshot: "SYS_ADMIN",
          action: "USER_UNLOCKED",
          entity_type: "user",
          entity_id: data.uid,
          details: {},
        });
        return NextResponse.json({ success: true });
      }

      case "reset_password": {
        const userRecord = await adminAuth.getUser(data.uid);
        if (!userRecord.email) {
          return NextResponse.json({ error: "User has no email address." }, { status: 400 });
        }
        const resetLink = await adminAuth.generatePasswordResetLink(userRecord.email);
        return NextResponse.json({ resetLink });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
