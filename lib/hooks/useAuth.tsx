"use client";

import {
  User,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { rolePermissions } from "@/lib/utils/rbac";
import type { AppUser, Permission, RoleRecord, UserRole } from "@/types";

interface AuthContextValue {
  user: User | null;
  appUser: AppUser | null;
  role: UserRole | null;
  permissions: Permission[];
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfile(user: User) {
  const db = getFirebaseDb();
  const [userSnap, roleSnap] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    getDoc(doc(db, "roles", user.uid)),
  ]);

  if (!userSnap.exists() || !roleSnap.exists()) {
    throw new Error(
      "Your Firebase login exists, but its PharmPOS profile is incomplete. Create matching users and roles documents for this UID.",
    );
  }

  const roleRecord = roleSnap.data() as RoleRecord;
  const role = roleRecord.role;
  const permissions = roleRecord.permissions?.length
    ? roleRecord.permissions
    : rolePermissions[role];

  void updateDoc(doc(db, "users", user.uid), {
    last_login: serverTimestamp(),
    failed_attempts: 0,
  }).catch(() => undefined);

  return {
    appUser: userSnap.data() as AppUser,
    role,
    permissions,
  };
}

function authErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  const message = error instanceof Error ? error.message : "";

  if (message.includes("client is offline") || code === "unavailable") {
    return "Firebase Authentication responded, but PharmPOS could not reach Cloud Firestore. Realtime Database is a different service and cannot be used here. Create Cloud Firestore in this Firebase project, then try again.";
  }

  if (message.includes("PharmPOS profile is incomplete")) {
    return message;
  }

  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "The email or password is incorrect.";
  }

  if (code === "auth/user-disabled") {
    return "This account has been disabled. Contact the owner or system administrator.";
  }

  if (code === "auth/too-many-requests") {
    return "Too many sign-in attempts. Wait a moment before trying again.";
  }

  if (code === "permission-denied") {
    return "Your account authenticated, but Firestore denied access to its PharmPOS profile.";
  }

  return message || "Sign in failed. Check Firebase configuration and try again.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setUser(null);
    setAppUser(null);
    setRole(null);
    setPermissions([]);
    document.cookie = "pharmpos-session=; path=/; max-age=0; SameSite=Lax";
  }, []);

  const hydrateUser = useCallback(async (firebaseUser: User) => {
    const profile = await loadProfile(firebaseUser);

    if (profile.appUser.locked || profile.appUser.active === false) {
      throw new Error("This PharmPOS account is locked or inactive. Contact the owner or system administrator.");
    }

    setUser(firebaseUser);
    setAppUser(profile.appUser);
    setRole(profile.role);
    setPermissions(profile.permissions);
    setAuthError(null);
    document.cookie = "pharmpos-session=1; path=/; max-age=604800; SameSite=Lax";
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let configurationTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
          clearSession();
          setLoading(false);
          return;
        }

        try {
          await hydrateUser(firebaseUser);
        } catch (error) {
          setAuthError(authErrorMessage(error));
          await firebaseSignOut(auth).catch(() => undefined);
          clearSession();
        } finally {
          setLoading(false);
        }
      });
    } catch {
      configurationTimer = setTimeout(() => setLoading(false), 0);
    }

    return () => {
      unsubscribe();
      if (configurationTimer) {
        clearTimeout(configurationTimer);
      }
    };
  }, [clearSession, hydrateUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setAuthError(null);

    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      await hydrateUser(credential.user);
    } catch (error) {
      const message = authErrorMessage(error);
      setAuthError(message);
      clearSession();
      await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [clearSession, hydrateUser]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
    clearSession();
    setAuthError(null);
  }, [clearSession]);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getFirebaseAuth(), email);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo(
    () => ({
      user,
      appUser,
      role,
      permissions,
      loading,
      authError,
      signIn,
      signOut,
      resetPassword,
      clearAuthError,
    }),
    [appUser, authError, clearAuthError, loading, permissions, resetPassword, role, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
