"use client";

import { useState } from "react";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/lib/auth-context";
import { MAX_NAME_LENGTH, cleanName } from "@/lib/names";
import AuthShell, { AuthError, authButtonCls, authInputCls } from "./AuthShell";

/**
 * Shown after the emailed link signs someone in, until their profile is complete. It only asks
 * for what is missing: a name, a password, or both (accounts made before names existed need
 * just the name).
 */
export default function FinishSetupScreen() {
  const { user, setPassword, saveProfile, signOut, error, clearError } = useAuth();
  const needsName = !user?.firstName || !user?.lastName;
  const needsPassword = !user?.hasPassword;

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    if (needsName && (!cleanName(firstName) || !cleanName(lastName))) {
      setLocalError("Enter your first and last name.");
      return;
    }
    if (needsPassword) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
        return;
      }
      if (password !== confirm) {
        setLocalError("The two passwords don't match.");
        return;
      }
    }
    setLocalError(null);
    setBusy(true);
    const nameOk = needsName ? await saveProfile(firstName, lastName) : true;
    if (nameOk && needsPassword) await setPassword(password);
    setBusy(false);
  }

  const heading = needsName && needsPassword ? "Your email is verified." : needsPassword ? "Choose a password." : "Almost there.";
  const blurb =
    needsName && needsPassword
      ? `${user?.email} is confirmed. Add your name and choose a password to finish creating your account.`
      : needsPassword
        ? `${user?.email} is confirmed. Choose a password to finish creating your account.`
        : "Add your name so teammates can recognise you in tasks and teams.";

  return (
    <AuthShell footer={needsPassword ? "You'll use this email and password to sign in from now on." : undefined}>
      <AuthError message={localError ?? error} />
      <form onSubmit={handleSubmit}>
        <p className="text-sm font-semibold text-gold">{heading}</p>
        <p className="mt-1 text-sm text-white/70">{blurb}</p>

        {needsName && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              required
              autoFocus
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              aria-label="First name"
              maxLength={MAX_NAME_LENGTH}
              className={authInputCls.replace("mt-3", "mt-0")}
            />
            <input
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              aria-label="Last name"
              maxLength={MAX_NAME_LENGTH}
              className={authInputCls.replace("mt-3", "mt-0")}
            />
          </div>
        )}

        {needsPassword && (
          <>
            <input
              type="password"
              required
              autoFocus={!needsName}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
              aria-label="New password"
              className={authInputCls}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              aria-label="Confirm password"
              className={authInputCls}
            />
          </>
        )}

        <button type="submit" disabled={busy} className={authButtonCls}>
          {busy ? "Saving…" : needsPassword ? "Save and continue" : "Continue"}
        </button>
        <button type="button" onClick={signOut} className="mt-4 text-sm text-white/50 hover:text-white">
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
