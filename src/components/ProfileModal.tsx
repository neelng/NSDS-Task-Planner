"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MAX_NAME_LENGTH } from "@/lib/names";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/lib/ui";

/** Lets someone change their own name. Mounted only while open, so it starts from the saved values. */
export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, saveProfile, error, clearError } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  function close() {
    clearError();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await saveProfile(firstName, lastName);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-gold/30 bg-ink px-5 py-3">
          <h2 className="font-display text-base font-semibold tracking-wide text-gold">Your profile</h2>
          <button onClick={close} aria-label="Close" className="text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="profile-first" className={labelCls}>
                First name
              </label>
              <input
                id="profile-first"
                required
                autoFocus
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="profile-last" className={labelCls}>
                Last name
              </label>
              <input
                id="profile-last"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Email</label>
            <p className="text-sm text-ink">{user.email}</p>
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <p className="text-sm text-ink">{user.title || <span className="text-muted">None yet. An admin sets titles.</span>}</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" onClick={close} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
