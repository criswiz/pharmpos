import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { rolePermissions } from "@/lib/utils/rbac";

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["OWNER", "STORE_MANAGER", "RETAIL_STAFF", "WHOLESALE_STAFF", "SYS_ADMIN"]),
});

export async function POST(request: Request) {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!bearerToken) {
    return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  }

  const requester = await adminAuth.verifyIdToken(bearerToken);
  const requesterRole = await adminDb.collection("roles").doc(requester.uid).get();
  const requesterRoleValue = requesterRole.data()?.role;

  if (!["OWNER", "SYS_ADMIN"].includes(requesterRoleValue)) {
    return NextResponse.json({ error: "Insufficient permission" }, { status: 403 });
  }

  const body = createUserSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: "Invalid user payload" }, { status: 400 });
  }

  const { name, email, role } = body.data;
  const user = await adminAuth.createUser({
    displayName: name,
    email,
    emailVerified: false,
    disabled: false,
  });

  await adminDb.runTransaction(async (transaction) => {
    const now = new Date();
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
      shopAccess: role === "RETAIL_STAFF" ? ["retail"] : role === "WHOLESALE_STAFF" ? ["wholesale"] : ["shared"],
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

  return NextResponse.json({
    uid: user.uid,
    resetLink,
  });
}
