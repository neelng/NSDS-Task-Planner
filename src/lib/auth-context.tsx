"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut as firebaseSignOut,
  updatePassword,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, isAllowedEmail, isFirebaseConfigured, ALLOWED_EMAIL_DOMAIN } from "./firebase";
import { createUserDoc, getUserDoc, markPasswordSet, updateProfileName } from "./firestore";
import { cleanName, fullName } from "./names";
import type { AppUser, Role } from "./types";

const EMAIL_STORAGE_KEY = "emailForSignIn";
const NAME_STORAGE_KEY = "nameForSignUp";
export const MIN_PASSWORD_LENGTH = 8;

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  configured: boolean;
  /** True when the user opened a sign-in link on a device that doesn't remember their email. */
  needsEmailConfirm: boolean;
  clearError: () => void;
  /** Create account, step 1: emails a one-time link. The name is remembered for step 2. */
  sendLoginLink: (email: string, firstName: string, lastName: string) => Promise<boolean>;
  /** Change your own first and last name. */
  saveProfile: (firstName: string, lastName: string) => Promise<boolean>;
  completeLinkSignIn: (email: string) => Promise<void>;
  /** Returning users. */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  /** Create account, step 2: the person picks a password after the link signs them in. */
  setPassword: (newPassword: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function adminAllowlist(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "This sign-in link is invalid or has already been used. Request a new one.";
    case "auth/invalid-email":
      return "That email address is not valid, or does not match the address the link was sent to.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password. If you haven't created an account yet, choose Create account.";
    case "auth/weak-password":
      return `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`;
    case "auth/requires-recent-login":
      return "For security, sign out and request a new sign-in link, then set your password right away.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Couldn't reach the server. Check your connection and try again.";
    default:
      return err instanceof Error ? err.message : "Something went wrong. Please try again.";
  }
}

function readStoredEmail(): string | null {
  try {
    return window.localStorage.getItem(EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeEmail(email: string) {
  try {
    window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
  } catch {
    // Storage blocked (private mode); the user will just be asked to confirm their email.
  }
}

/** The name typed on the Create account tab, kept for when the emailed link brings them back. */
function storePendingName(email: string, firstName: string, lastName: string) {
  try {
    window.localStorage.setItem(NAME_STORAGE_KEY, JSON.stringify({ email, firstName, lastName }));
  } catch {
    // Storage blocked; the finish-setup screen will simply ask for the name again.
  }
}

function readPendingName(email: string): { firstName: string; lastName: string } | null {
  try {
    const raw = window.localStorage.getItem(NAME_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { email?: string; firstName?: string; lastName?: string };
    if (saved.email !== email) return null;
    return { firstName: cleanName(saved.firstName ?? ""), lastName: cleanName(saved.lastName ?? "") };
  } catch {
    return null;
  }
}

function clearPendingName() {
  try {
    window.localStorage.removeItem(NAME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function cleanUrl() {
  window.history.replaceState(null, "", window.location.pathname);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }
    const authInstance = auth;

    return onAuthStateChanged(authInstance, async (fbUser) => {
      if (!fbUser) {
        setFirebaseUser(null);
        setUser(null);

        // Landing here from the emailed link: finish signing in.
        if (isSignInWithEmailLink(authInstance, window.location.href)) {
          const stored = readStoredEmail();
          if (stored) {
            try {
              await signInWithEmailLink(authInstance, stored, window.location.href);
              cleanUrl();
              return; // onAuthStateChanged fires again with the signed-in user
            } catch (err) {
              setError(friendlyAuthError(err));
              cleanUrl();
            }
          } else {
            setNeedsEmailConfirm(true);
          }
        }
        setLoading(false);
        return;
      }

      if (!fbUser.emailVerified || !isAllowedEmail(fbUser.email)) {
        setError(`Only verified @${ALLOWED_EMAIL_DOMAIN} email addresses can sign in.`);
        await firebaseSignOut(authInstance);
        return; // signing out fires this callback again with no user
      }

      setFirebaseUser(fbUser);

      let appUser = await getUserDoc(fbUser.uid);
      if (!appUser) {
        const email = (fbUser.email || "").toLowerCase();
        const role: Role = adminAllowlist().includes(email) ? "admin" : "member";
        const pending = readPendingName(email);
        const firstName = pending?.firstName ?? "";
        const lastName = pending?.lastName ?? "";
        const newUser: AppUser = {
          uid: fbUser.uid,
          // Until they give a name, show the part of their email before the @.
          name: fullName(firstName, lastName) || email.split("@")[0] || "Unknown",
          firstName,
          lastName,
          email,
          photoURL: fbUser.photoURL,
          title: "",
          role,
          hasPassword: false,
          createdAt: null,
        };
        try {
          await createUserDoc(newUser);
          appUser = newUser;
        } catch (err) {
          // The rules only let emails listed in bootstrapAdmins() start as admin.
          if (role !== "admin") throw err;
          console.warn("Admin bootstrap rejected by security rules; creating a member profile.", err);
          const fallback: AppUser = { ...newUser, role: "member" };
          await createUserDoc(fallback);
          appUser = fallback;
        }
        clearPendingName();
      }
      setUser(appUser);
      setLoading(false);
    });
  }, []);

  const clearError = () => setError(null);

  const sendLoginLink = async (
    rawEmail: string,
    rawFirstName: string,
    rawLastName: string
  ): Promise<boolean> => {
    if (!auth) {
      setError("Firebase is not configured. Add your .env.local values first.");
      return false;
    }
    setError(null);
    const email = rawEmail.trim().toLowerCase();
    const firstName = cleanName(rawFirstName);
    const lastName = cleanName(rawLastName);
    if (!firstName || !lastName) {
      setError("Enter your first and last name.");
      return false;
    }
    if (!isAllowedEmail(email)) {
      setError(`Use your @${ALLOWED_EMAIL_DOMAIN} email address.`);
      return false;
    }
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}/`,
        handleCodeInApp: true,
      });
      storeEmail(email);
      storePendingName(email, firstName, lastName);
      return true;
    } catch (err) {
      setError(friendlyAuthError(err));
      return false;
    }
  };

  const completeLinkSignIn = async (rawEmail: string): Promise<void> => {
    if (!auth) return;
    setError(null);
    try {
      await signInWithEmailLink(auth, rawEmail.trim().toLowerCase(), window.location.href);
      setNeedsEmailConfirm(false);
      cleanUrl();
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  };

  const signInWithPassword = async (rawEmail: string, password: string): Promise<void> => {
    if (!auth) return;
    setError(null);
    const email = rawEmail.trim().toLowerCase();
    if (!isAllowedEmail(email)) {
      setError(`Use your @${ALLOWED_EMAIL_DOMAIN} email address.`);
      return;
    }
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Signing in with a password proves they have one, even if it was set via a reset email.
      markPasswordSet(cred.user.uid).catch(() => {});
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  };

  const sendPasswordReset = async (rawEmail: string): Promise<boolean> => {
    if (!auth) return false;
    setError(null);
    const email = rawEmail.trim().toLowerCase();
    if (!isAllowedEmail(email)) {
      setError(`Use your @${ALLOWED_EMAIL_DOMAIN} email address.`);
      return false;
    }
    try {
      await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/` });
      return true;
    } catch (err) {
      // Don't reveal whether an account exists for this address.
      if ((err as { code?: string }).code === "auth/user-not-found") return true;
      setError(friendlyAuthError(err));
      return false;
    }
  };

  const saveProfile = async (rawFirstName: string, rawLastName: string): Promise<boolean> => {
    const current = auth?.currentUser;
    if (!current) return false;
    setError(null);
    const firstName = cleanName(rawFirstName);
    const lastName = cleanName(rawLastName);
    if (!firstName || !lastName) {
      setError("Enter your first and last name.");
      return false;
    }
    try {
      const name = await updateProfileName(current.uid, firstName, lastName);
      setUser((prev) => (prev ? { ...prev, firstName, lastName, name } : prev));
      return true;
    } catch (err) {
      setError(friendlyAuthError(err));
      return false;
    }
  };

  const setPassword = async (newPassword: string): Promise<boolean> => {
    const current = auth?.currentUser;
    if (!current) return false;
    setError(null);
    try {
      await updatePassword(current, newPassword);
      await markPasswordSet(current.uid);
      setUser((prev) => (prev ? { ...prev, hasPassword: true } : prev));
      return true;
    } catch (err) {
      setError(friendlyAuthError(err));
      return false;
    }
  };

  const signOut = async () => {
    if (!auth) return;
    setError(null);
    await firebaseSignOut(auth);
  };

  const value = useMemo(
    () => ({
      firebaseUser,
      user,
      loading,
      error,
      configured: isFirebaseConfigured,
      needsEmailConfirm,
      clearError,
      sendLoginLink,
      saveProfile,
      completeLinkSignIn,
      signInWithPassword,
      sendPasswordReset,
      setPassword,
      signOut,
    }),
    [firebaseUser, user, loading, error, needsEmailConfirm]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
