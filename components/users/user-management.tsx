"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  Copy,
  KeyRound,
  Lock,
  LockOpen,
  Plus,
  UserRoundCog,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { formatRole } from "@/lib/utils/rbac";
import {
  adminCreateUser,
  adminResetPassword,
  adminToggleActive,
  adminUnlockUser,
  adminUpdateRole,
  subscribeUsers,
  type UserWithRole,
} from "@/lib/services/users.service";
import type { UserRole } from "@/types";

const ROLES: UserRole[] = [
  "OWNER",
  "STORE_MANAGER",
  "RETAIL_STAFF",
  "WHOLESALE_STAFF",
  "SYS_ADMIN",
];

const ROLE_COLORS: Record<UserRole, string> = {
  OWNER: "bg-purple-50 text-purple-700",
  STORE_MANAGER: "bg-sky-50 text-sky-700",
  RETAIL_STAFF: "bg-emerald-50 text-emerald-700",
  WHOLESALE_STAFF: "bg-amber-50 text-amber-700",
  SYS_ADMIN: "bg-zinc-100 text-zinc-600",
};

function formatDate(value: unknown): string {
  if (!value) return "Never";
  try {
    const d =
      typeof (value as { toDate?: () => Date }).toDate === "function"
        ? (value as { toDate: () => Date }).toDate()
        : new Date(value as string);
    return new Intl.DateTimeFormat("en-GH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return "—";
  }
}

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  role: z.enum(["OWNER", "STORE_MANAGER", "RETAIL_STAFF", "WHOLESALE_STAFF", "SYS_ADMIN"]),
});

type CreateUserInput = z.infer<typeof createUserSchema>;

export function UserManagement() {
  const { user: currentUser, role: currentRole } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editRoleFor, setEditRoleFor] = useState<UserWithRole | null>(null);
  const [resetLinkFor, setResetLinkFor] = useState<{ name: string; link: string } | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const unsub = subscribeUsers(
        (data) => { setUsers(data); setLoading(false); },
        () => { setLoadError("Users could not be loaded. Check Firestore access."); setLoading(false); },
      );
      return unsub;
    } catch {
      fallbackTimer = setTimeout(() => {
        setLoadError("Add Firebase credentials to .env.local.");
        setLoading(false);
      }, 0);
      return () => clearTimeout(fallbackTimer);
    }
  }, []);

  async function getIdToken() {
    const token = await currentUser?.getIdToken();
    if (!token) throw new Error("Could not obtain authentication token.");
    return token;
  }

  async function handleToggleActive(u: UserWithRole) {
    setActionPending(u.uid + ":active");
    try {
      await adminToggleActive(u.uid, !u.active, await getIdToken());
      toast({ title: `${u.active ? "Deactivated" : "Activated"}`, description: u.name, variant: "success" });
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Operation failed.", variant: "error" });
    } finally {
      setActionPending(null);
    }
  }

  async function handleUnlock(u: UserWithRole) {
    setActionPending(u.uid + ":unlock");
    try {
      await adminUnlockUser(u.uid, await getIdToken());
      toast({ title: "Account unlocked", description: u.name, variant: "success" });
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Operation failed.", variant: "error" });
    } finally {
      setActionPending(null);
    }
  }

  async function handleResetPassword(u: UserWithRole) {
    setActionPending(u.uid + ":reset");
    try {
      const link = await adminResetPassword(u.uid, await getIdToken());
      setResetLinkFor({ name: u.name, link });
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Operation failed.", variant: "error" });
    } finally {
      setActionPending(null);
    }
  }

  const isSelf = (uid: string) => uid === currentUser?.uid;
  const canAdmin = currentRole === "OWNER" || currentRole === "SYS_ADMIN";

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">User Management</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Create accounts, assign roles, and manage staff access. Only owners and system admins can make changes.
          </p>
        </div>
        {canAdmin ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Add user
          </button>
        ) : null}
      </header>

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}

      <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Last login</th>
                {canAdmin ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: canAdmin ? 5 : 4 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      ))}
                    </tr>
                  ))
                : users.map((u) => (
                    <tr key={u.uid} className={`hover:bg-zinc-50 ${isSelf(u.uid) ? "bg-emerald-50/30" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-emerald-950">
                          {u.name}
                          {isSelf(u.uid) ? <span className="ml-2 text-xs font-normal text-zinc-400">(you)</span> : null}
                        </p>
                        <p className="text-xs text-zinc-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {u.role ? (
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                            {formatRole(u.role)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">No role</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${u.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                            {u.active ? "Active" : "Inactive"}
                          </span>
                          {u.locked ? (
                            <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                              <Lock className="h-3 w-3" />
                              Locked
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{formatDate(u.last_login)}</td>
                      {canAdmin ? (
                        <td className="px-4 py-3">
                          {isSelf(u.uid) ? (
                            <span className="text-xs text-zinc-400">—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="Change role"
                                onClick={() => setEditRoleFor(u)}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-sky-50 hover:text-sky-700"
                              >
                                <UserRoundCog className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title={u.active ? "Deactivate" : "Activate"}
                                disabled={actionPending === u.uid + ":active"}
                                onClick={() => handleToggleActive(u)}
                                className={`flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 disabled:opacity-50 ${u.active ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-emerald-50 hover:text-emerald-700"}`}
                              >
                                {u.active ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                              </button>
                              {u.locked ? (
                                <button
                                  type="button"
                                  title="Unlock account"
                                  disabled={actionPending === u.uid + ":unlock"}
                                  onClick={() => handleUnlock(u)}
                                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                                >
                                  <LockOpen className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                title="Generate password reset link"
                                disabled={actionPending === u.uid + ":reset"}
                                onClick={() => handleResetPassword(u)}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-emerald-700 disabled:opacity-50"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && users.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
            <UserRoundCog className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No users found</p>
            <p className="mt-1 text-sm text-zinc-500">Add the first user to get started.</p>
          </div>
        ) : null}
      </section>

      {createOpen ? (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          getIdToken={getIdToken}
          toast={toast}
          onResetLink={(name, link) => { setCreateOpen(false); setResetLinkFor({ name, link }); }}
        />
      ) : null}

      {editRoleFor ? (
        <EditRoleModal
          user={editRoleFor}
          onClose={() => setEditRoleFor(null)}
          getIdToken={getIdToken}
          toast={toast}
        />
      ) : null}

      {resetLinkFor ? (
        <ResetLinkModal
          name={resetLinkFor.name}
          link={resetLinkFor.link}
          onClose={() => setResetLinkFor(null)}
        />
      ) : null}
    </div>
  );
}

function CreateUserModal({
  onClose,
  getIdToken,
  toast,
  onResetLink,
}: {
  onClose: () => void;
  getIdToken: () => Promise<string>;
  toast: ReturnType<typeof useToast>["toast"];
  onResetLink: (name: string, link: string) => void;
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", role: "RETAIL_STAFF" },
  });

  async function onSubmit(input: CreateUserInput) {
    setSubmitError("");
    try {
      const token = await getIdToken();
      const result = await adminCreateUser(input, token);
      toast({ title: "User created", description: `${input.name} — a password reset link was generated.`, variant: "success" });
      onResetLink(input.name, result.resetLink);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create user.");
    }
  }

  const fc = "mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Administration</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Add user</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <label className="block text-sm font-medium text-emerald-950">
            Full name
            <input className={fc} autoFocus {...register("name")} />
            {errors.name ? <span className="mt-1 block text-xs font-normal text-red-600">{errors.name.message}</span> : null}
          </label>
          <label className="block text-sm font-medium text-emerald-950">
            Email address
            <input type="email" className={fc} {...register("email")} />
            {errors.email ? <span className="mt-1 block text-xs font-normal text-red-600">{errors.email.message}</span> : null}
          </label>
          <label className="block text-sm font-medium text-emerald-950">
            Role
            <select className={fc} {...register("role")}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{formatRole(r)}</option>
              ))}
            </select>
          </label>
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            The user will receive a password reset link to set their password. Share it securely — it expires after 24 hours.
          </p>
          {submitError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-3 border-t border-zinc-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {isSubmitting ? "Creating…" : "Create user"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function EditRoleModal({
  user,
  onClose,
  getIdToken,
  toast,
}: {
  user: UserWithRole;
  onClose: () => void;
  getIdToken: () => Promise<string>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [role, setRole] = useState<UserRole>(user.role ?? "RETAIL_STAFF");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await adminUpdateRole(user.uid, role, await getIdToken());
      toast({ title: "Role updated", description: `${user.name} → ${formatRole(role)}`, variant: "success" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Administration</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Change role</h2>
            <p className="mt-0.5 text-sm text-zinc-500">{user.name}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 p-5">
          {ROLES.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 has-checked:border-emerald-700 has-checked:bg-emerald-50/50">
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="accent-emerald-700"
              />
              <div>
                <p className="text-sm font-medium text-emerald-950">{formatRole(r)}</p>
              </div>
            </label>
          ))}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </div>

        <footer className="flex justify-end gap-3 border-t border-zinc-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
          <button type="button" disabled={saving || role === user.role} onClick={handleSave} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {saving ? "Saving…" : "Save role"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ResetLinkModal({ name, link, onClose }: { name: string; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Administration</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Password reset link</h2>
            <p className="mt-0.5 text-sm text-zinc-500">{name}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <p className="text-sm text-zinc-600">
            Share this link with {name} securely. It expires after 24 hours and can only be used once.
          </p>
          <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700">{link}</p>
            <button
              type="button"
              onClick={handleCopy}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs transition ${copied ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"}`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <footer className="flex justify-end border-t border-zinc-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800">
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
