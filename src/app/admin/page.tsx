"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { deleteUserDoc, updateUserRole, updateUserTitle } from "@/lib/firestore";
import { isAdmin } from "@/lib/permissions";
import { displayRole, teamsOfUser } from "@/lib/teams";
import { ROLE_LABELS, type AppUser, type Role } from "@/lib/types";
import { btnDanger, btnSecondary, card, inputCls } from "@/lib/ui";
import Avatar from "@/components/Avatar";
import PageHeader from "@/components/PageHeader";
import RoleBadge from "@/components/RoleBadge";

export default function AdminPage() {
  const { user: me } = useAuth();
  const { users, teams, ready } = useData();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users
      .filter((u) => roleFilter === "all" || u.role === roleFilter)
      .filter(
        (u) =>
          !needle ||
          u.name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          u.title.toLowerCase().includes(needle)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, search, roleFilter]);

  if (!isAdmin(me)) {
    return <p className="text-sm text-muted">You don&apos;t have access to this page.</p>;
  }

  async function guarded(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  const selectable = rows.filter((u) => u.uid !== me?.uid);

  function toggleAll() {
    setSelected((prev) =>
      prev.size === selectable.length ? new Set() : new Set(selectable.map((u) => u.uid))
    );
  }

  function applyBulk() {
    if (!confirm(`Set ${selected.size} ${selected.size === 1 ? "person" : "people"} to ${ROLE_LABELS[bulkRole]}?`)) return;
    guarded(async () => {
      await Promise.all([...selected].map((uid) => updateUserRole(uid, bulkRole)));
      setSelected(new Set());
    });
  }

  function remove(u: AppUser) {
    if (!confirm(`Remove ${u.name}'s profile? They can sign in again to recreate it as a member.`)) return;
    guarded(() => deleteUserDoc(u.uid));
  }

  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="Set titles and roles. Admins have full control; Directors manage their own divisions; everyone else is a member. Leads are appointed on the Teams page."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or title…" className={clsx(inputCls, "pl-8")} />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "all")} className={clsx(inputCls, "w-auto")}>
          <option value="all">All roles</option>
          {Object.entries(ROLE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className={clsx(card, "mb-4 flex flex-wrap items-center gap-3 border-gold px-4 py-3 text-sm")}>
          <span className="font-semibold">{selected.size} selected</span>
          <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value as Role)} className={clsx(inputCls, "w-auto py-1")}>
            {Object.entries(ROLE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                Set role: {label}
              </option>
            ))}
          </select>
          <button onClick={applyBulk} disabled={busy} className={btnSecondary}>
            Apply
          </button>
          <button onClick={() => setSelected(new Set())} className="text-muted hover:text-ink">
            Clear
          </button>
        </div>
      )}
      {message && <p className="mb-3 text-sm text-red-700">{message}</p>}

      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-paper text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selectable.length > 0 && selected.size === selectable.length}
                    onChange={toggleAll}
                    className="accent-gold-dark"
                  />
                </th>
                <th className="px-3 py-2 font-semibold">Person</th>
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="px-3 py-2 font-semibold">Teams</th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isMe = u.uid === me?.uid;
                const teamNames = teamsOfUser(teams, u.uid).map((t) => t.name);
                return (
                  <tr key={u.uid} className="border-t border-line">
                    <td className="px-3 py-2">
                      {!isMe && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${u.name}`}
                          checked={selected.has(u.uid)}
                          onChange={() => toggle(u.uid)}
                          className="accent-gold-dark"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Avatar name={u.name} size={28} />
                        <span>
                          <span className="block font-medium text-ink">
                            {u.name} {isMe && <span className="text-xs font-normal text-muted">(you)</span>}
                          </span>
                          <span className="block text-xs text-muted">{u.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        key={u.title}
                        defaultValue={u.title}
                        placeholder="e.g. Vice President"
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== u.title) guarded(() => updateUserTitle(u.uid, value));
                        }}
                        className={clsx(inputCls, "py-1")}
                      />
                    </td>
                    <td className="max-w-[220px] px-3 py-2 text-xs text-muted">
                      {teamNames.length ? teamNames.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {isMe ? (
                        <RoleBadge role={displayRole(u, teams)} />
                      ) : (
                        <span className="flex items-center gap-2">
                          <select
                            value={u.role}
                            disabled={busy}
                            onChange={(e) => guarded(() => updateUserRole(u.uid, e.target.value as Role))}
                            className={clsx(inputCls, "w-auto py-1")}
                          >
                            {Object.entries(ROLE_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                          {u.role === "member" && displayRole(u, teams) === "Lead" && <RoleBadge role="Lead" />}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!isMe && (
                        <button onClick={() => remove(u)} className={btnDanger}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {ready && rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No one matches.</p>}
      </div>
    </div>
  );
}
