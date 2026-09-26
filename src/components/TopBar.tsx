"use client";

import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { breadcrumb, displayRole } from "@/lib/teams";
import { useScope } from "@/lib/use-scope";
import Avatar from "./Avatar";
import ProfileModal from "./ProfileModal";
import RoleBadge from "./RoleBadge";

export default function TopBar({ onMenu }: { onMenu: () => void }) {
  const { user, signOut } = useAuth();
  const { teams, teamsById } = useData();
  const { scopeId, setScope } = useScope();
  const [profileOpen, setProfileOpen] = useState(false);
  if (!user) return null;

  const scopeTeam = scopeId ? teamsById.get(scopeId) : undefined;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-ink hover:bg-gold-tint lg:hidden"
        >
          <Menu size={20} />
        </button>
        {scopeTeam ? (
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-gold-tint px-3 py-1 text-xs font-medium text-gold-dark">
            <span className="truncate">{breadcrumb(teamsById, scopeTeam.id)}</span>
            <button onClick={() => setScope(null)} aria-label="Clear team filter" className="shrink-0 hover:text-ink">
              <X size={13} />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted">Showing all teams</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={() => setProfileOpen(true)}
          title="Edit your profile"
          aria-label="Edit your profile"
          className="flex items-center gap-3 rounded-md p-1 transition hover:bg-gold-tint"
        >
          <span className="hidden text-right sm:block">
            <span className="block text-sm font-medium leading-tight text-ink">{user.name}</span>
            {user.title && <span className="block text-[11px] leading-tight text-muted">{user.title}</span>}
          </span>
          <Avatar name={user.name} size={32} />
        </button>
        <RoleBadge role={displayRole(user, teams)} />
        <button
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className="rounded-md p-1.5 text-muted transition hover:bg-gold-tint hover:text-ink"
        >
          <LogOut size={16} />
        </button>
      </div>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
