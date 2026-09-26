"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { DataProvider } from "@/lib/data-context";
import LoginScreen from "./LoginScreen";
import FinishSetupScreen from "./FinishSetupScreen";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: ReactNode }) {
  const { loading, configured, user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink px-4">
        <div className="max-w-md rounded-xl border border-gold/40 bg-charcoal p-6 text-sm text-white/80">
          <h1 className="mb-2 font-display text-base font-semibold text-gold">
            Firebase is not configured
          </h1>
          <p>
            Copy <code className="rounded bg-white/10 px-1">.env.local.example</code> to{" "}
            <code className="rounded bg-white/10 px-1">.env.local</code>, fill in your Firebase
            project keys, then restart the dev server. See README.md for the full setup.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Signed in by the emailed link but hasn't finished setting up: needs a password and/or a name.
  if (!user.hasPassword || !user.firstName || !user.lastName) {
    return <FinishSetupScreen />;
  }

  return (
    <DataProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setNavOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>
    </DataProvider>
  );
}
