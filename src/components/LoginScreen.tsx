"use client";

import { useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth-context";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/firebase";
import { MAX_NAME_LENGTH } from "@/lib/names";
import AuthShell, { AuthError, authButtonCls, authInputCls } from "./AuthShell";

type Mode = "signin" | "create" | "forgot";

export default function LoginScreen() {
  const {
    sendLoginLink,
    completeLinkSignIn,
    signInWithPassword,
    sendPasswordReset,
    needsEmailConfirm,
    error,
    clearError,
  } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const placeholder = `you@${ALLOWED_EMAIL_DOMAIN}`;

  function switchMode(next: Mode) {
    clearError();
    setMode(next);
    setSentTo(null);
    setResetSent(false);
    setPassword("");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await signInWithPassword(email, password);
    setBusy(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await sendLoginLink(email, firstName, lastName);
    setBusy(false);
    if (ok) setSentTo(email.trim().toLowerCase());
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await sendPasswordReset(email);
    setBusy(false);
    if (ok) setResetSent(true);
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await completeLinkSignIn(email);
    setBusy(false);
  }

  const renderEmailField = (autoFocus = true) => (
    <input
      type="email"
      required
      autoFocus={autoFocus}
      autoComplete="email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      placeholder={placeholder}
      aria-label="Email address"
      className={authInputCls}
    />
  );

  const footer = (
    <>
      Access is limited to @{ALLOWED_EMAIL_DOMAIN} addresses. Your role is assigned by the
      society&apos;s administrators.
    </>
  );

  // Opened the emailed link on a device that doesn't remember the address.
  if (needsEmailConfirm) {
    return (
      <AuthShell footer={footer}>
        <AuthError message={error} />
        <form onSubmit={handleConfirm}>
          <p className="text-sm text-white/70">
            Confirm the email address you requested the link with to finish creating your account.
          </p>
          {renderEmailField()}
          <button type="submit" disabled={busy} className={authButtonCls}>
            {busy ? "Working…" : "Continue"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell footer={footer}>
      {mode !== "forgot" && (
        <div role="tablist" className="mb-5 grid grid-cols-2 rounded-md bg-ink p-1 text-sm font-medium">
          {(
            [
              ["signin", "Sign in"],
              ["create", "Create account"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => switchMode(key)}
              className={clsx(
                "rounded py-1.5 transition",
                mode === key ? "bg-gold-bright text-ink" : "text-white/60 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <AuthError message={error} />

      {mode === "signin" && (
        <form onSubmit={handleSignIn}>
          <p className="text-sm text-white/70">Sign in with your email and password.</p>
          {renderEmailField()}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className={authInputCls}
          />
          <button type="submit" disabled={busy} className={authButtonCls}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button type="button" onClick={() => switchMode("forgot")} className="text-gold hover:text-gold-bright">
              Forgot password?
            </button>
            <button type="button" onClick={() => switchMode("create")} className="text-white/50 hover:text-white">
              New here? Create an account
            </button>
          </div>
        </form>
      )}

      {mode === "create" &&
        (sentTo ? (
          <div>
            <p className="text-sm text-white/85">
              We sent a one-time link to <span className="font-semibold text-gold">{sentTo}</span>. Open it on this
              device, then choose your password.
            </p>
            <p className="mt-3 text-xs text-white/50">
              Nothing after a minute? Check your spam or junk folder. Each link works once.
            </p>
            <button onClick={() => setSentTo(null)} className="mt-4 text-sm font-medium text-gold hover:text-gold-bright">
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate}>
            <p className="text-sm text-white/70">
              Tell us who you are and enter your @{ALLOWED_EMAIL_DOMAIN} email. We&apos;ll send a one-time link; when you
              open it you&apos;ll choose a password for future sign-ins.
            </p>
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
            {renderEmailField(false)}
            <button type="submit" disabled={busy} className={authButtonCls}>
              {busy ? "Sending…" : "Email me a link"}
            </button>
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="mt-4 text-sm text-white/50 hover:text-white"
            >
              Already have an account? Sign in
            </button>
          </form>
        ))}

      {mode === "forgot" &&
        (resetSent ? (
          <div>
            <p className="text-sm text-white/85">
              If an account exists for <span className="font-semibold text-gold">{email.trim().toLowerCase()}</span>, a
              password reset link is on its way. Check your spam folder too.
            </p>
            <button onClick={() => switchMode("signin")} className="mt-4 text-sm font-medium text-gold hover:text-gold-bright">
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgot}>
            <p className="text-sm text-white/70">Enter your email and we&apos;ll send a link to reset your password.</p>
            {renderEmailField()}
            <button type="submit" disabled={busy} className={authButtonCls}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <button type="button" onClick={() => switchMode("signin")} className="mt-4 text-sm text-white/50 hover:text-white">
              Back to sign in
            </button>
          </form>
        ))}
    </AuthShell>
  );
}
