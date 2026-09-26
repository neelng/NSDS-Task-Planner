"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronRight, Network, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import {
  createTeam,
  deleteTeamIfEmpty,
  seedNsdsStructure,
  setTeamLeads,
  setTeamMembers,
  updateTeamInfo,
} from "@/lib/firestore";
import {
  canCreateTopLevelTeam,
  canManageMembers,
  canManageTeamStructure,
  isAdmin,
} from "@/lib/permissions";
import { breadcrumb, peopleInSubtree, sortTeams, subtree } from "@/lib/teams";
import type { Team } from "@/lib/types";
import { btnDanger, btnGhost, btnPrimary, btnSecondary, card, inputCls, labelCls } from "@/lib/ui";
import { useScope, withScope } from "@/lib/use-scope";
import Avatar from "@/components/Avatar";
import PageHeader from "@/components/PageHeader";
import PersonPicker from "@/components/PersonPicker";

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function TeamPanel({ team }: { team: Team }) {
  const { user } = useAuth();
  const { teams, teamsById, users, usersById, tasks } = useData();
  const { setScope } = useScope();

  const canStructure = canManageTeamStructure(user, team);
  const canMembers = canManageMembers(user, team);

  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description);
  const [leadIds, setLeadIds] = useState(team.leadIds);
  const [memberIds, setMemberIds] = useState(team.memberIds);
  const [newChild, setNewChild] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const children = sortTeams(teams.filter((t) => t.parentId === team.id));
  const openTasks = tasks.filter((t) => t.status !== "completed" && t.teamPath.includes(team.id)).length;
  const people = peopleInSubtree(teams, team.id).length;

  const infoDirty = name.trim() !== team.name || description.trim() !== team.description;
  const leadsDirty = !sameSet(leadIds, team.leadIds);
  const membersDirty = !sameSet(memberIds, team.memberIds);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${team.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const problem = await deleteTeamIfEmpty(teams, team.id);
      if (problem) {
        setMessage(problem);
        setBusy(false);
        return;
      }
      setScope(team.parentId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete the team.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className={clsx(card, "p-5")}>
        <p className="text-xs text-muted">{breadcrumb(teamsById, team.id)}</p>
        <div className="mt-3 grid gap-3">
          <div>
            <label className={labelCls}>Team name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canStructure} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canStructure}
              rows={2}
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
          <span>{people} people</span>
          <span>{children.length} subteams</span>
          <span>{openTasks} open tasks</span>
          <Link href={withScope("/tasks", team.id)} className="font-semibold text-gold-dark hover:underline">
            View tasks →
          </Link>
        </div>
        {canStructure && infoDirty && name.trim() && (
          <button
            disabled={busy}
            onClick={() => run(() => updateTeamInfo(team.id, { name: name.trim(), description: description.trim() }), "Saved.")}
            className={clsx(btnPrimary, "mt-4")}
          >
            Save details
          </button>
        )}
      </div>

      <div className={clsx(card, "p-5")}>
        <h3 className="font-display text-base font-semibold text-ink">Leads</h3>
        <p className="mb-3 mt-1 text-xs text-muted">
          Leads can create and edit tasks in this team and every subteam beneath it, and manage its
          members. Director powers (deleting tasks, managing subteams) come from the Director role, set by
          an admin.
        </p>
        <PersonPicker candidates={users} selectedIds={leadIds} onChange={setLeadIds} disabled={!canStructure} />
        {canStructure && leadsDirty && (
          <button
            disabled={busy}
            onClick={() => run(() => setTeamLeads(teams, team.id, leadIds), "Leads updated.")}
            className={clsx(btnPrimary, "mt-3")}
          >
            Save leads
          </button>
        )}
      </div>

      <div className={clsx(card, "p-5")}>
        <h3 className="font-display text-base font-semibold text-ink">Members</h3>
        <p className="mb-3 mt-1 text-xs text-muted">People who belong directly to this team.</p>
        <PersonPicker candidates={users} selectedIds={memberIds} onChange={setMemberIds} disabled={!canMembers} />
        {canMembers && membersDirty && (
          <button
            disabled={busy}
            onClick={() => run(() => setTeamMembers(team.id, memberIds), "Members updated.")}
            className={clsx(btnPrimary, "mt-3")}
          >
            Save members
          </button>
        )}
      </div>

      <div className={clsx(card, "p-5")}>
        <h3 className="font-display text-base font-semibold text-ink">Subteams</h3>
        <ul className="mt-3 divide-y divide-line">
          {children.map((c) => {
            const lead = c.leadIds.map((id) => usersById.get(id)?.name).filter(Boolean).join(", ");
            return (
              <li key={c.id}>
                <button
                  onClick={() => setScope(c.id)}
                  className="flex w-full items-center justify-between gap-3 py-2 text-left hover:text-gold-dark"
                >
                  <span>
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-muted">{lead || "No lead yet"}</span>
                  </span>
                  <ChevronRight size={14} className="text-muted" />
                </button>
              </li>
            );
          })}
          {children.length === 0 && <li className="py-2 text-sm text-muted">No subteams.</li>}
        </ul>
        {canStructure && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newChild.trim() || !user) return;
              run(async () => {
                await createTeam({
                  name: newChild.trim(),
                  description: "",
                  parent: team,
                  order: children.length,
                  createdBy: user.uid,
                });
                setNewChild("");
              }, "Subteam added.");
            }}
          >
            <input value={newChild} onChange={(e) => setNewChild(e.target.value)} placeholder="New subteam name" className={inputCls} />
            <button type="submit" disabled={busy || !newChild.trim()} className={btnSecondary}>
              <Plus size={14} /> Add
            </button>
          </form>
        )}
      </div>

      {canStructure && (team.parentId !== null || isAdmin(user)) && (
        <button onClick={handleDelete} disabled={busy} className={btnDanger}>
          <Trash2 size={14} /> Delete this team
        </button>
      )}
      {message && <p className="text-sm text-gold-dark">{message}</p>}
    </div>
  );
}

function Overview() {
  const { user } = useAuth();
  const { teams, users, usersById, tasks, colorFor, ready } = useData();
  const { setScope } = useScope();
  const [newRoot, setNewRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const roots = useMemo(() => sortTeams(teams.filter((t) => t.parentId === null)), [teams]);

  async function seed() {
    if (!user) return;
    if (!confirm("Create the standard society structure (Executive Board, Treasury, Operations, Technical)?")) return;
    setBusy(true);
    try {
      const n = await seedNsdsStructure(user.uid);
      setMessage(`Created ${n} teams. Rename the technical teams and assign leads next.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create the structure.");
    } finally {
      setBusy(false);
    }
  }

  async function addRoot(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoot.trim() || !user) return;
    setBusy(true);
    try {
      await createTeam({ name: newRoot.trim(), description: "", parent: null, order: roots.length, createdBy: user.uid });
      setNewRoot("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add the team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {ready && teams.length === 0 && (
        <div className={clsx(card, "mb-6 flex flex-wrap items-center justify-between gap-4 border-gold p-5")}>
          <div>
            <p className="font-semibold text-ink">No teams yet</p>
            <p className="mt-1 text-sm text-muted">
              {canCreateTopLevelTeam(user)
                ? "Create the society's org chart in one click, then rename and assign leads."
                : "An admin needs to set up the team structure."}
            </p>
          </div>
          {canCreateTopLevelTeam(user) && (
            <button onClick={seed} disabled={busy} className={btnPrimary}>
              <Network size={16} /> Set up NSDS structure
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roots.map((r) => {
          const inTree = subtree(teams, r.id);
          const open = tasks.filter((t) => t.status !== "completed" && t.teamPath.includes(r.id)).length;
          const leads = r.leadIds.map((id) => usersById.get(id)).filter((u) => u !== undefined);
          return (
            <button
              key={r.id}
              onClick={() => setScope(r.id)}
              className={clsx(card, "relative overflow-hidden p-5 pl-6 text-left transition hover:border-gold-dark hover:shadow-md")}
            >
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: colorFor(r.path) }} />
              <h3 className="font-display text-lg font-semibold text-ink">{r.name}</h3>
              <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-muted">{r.description}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                {leads.length > 0 ? (
                  <>
                    <span className="flex -space-x-1.5">
                      {leads.slice(0, 3).map((u) => (
                        <Avatar key={u.uid} name={u.name} size={22} className="ring-2 ring-white" />
                      ))}
                    </span>
                    <span className="truncate">{leads.map((u) => u.name).join(", ")}</span>
                  </>
                ) : (
                  <span>No lead assigned</span>
                )}
              </div>
              <div className="mt-3 flex gap-4 border-t border-line pt-3 text-xs text-muted">
                <span>{inTree.length - 1} subteams</span>
                <span>{peopleInSubtree(teams, r.id).length} people</span>
                <span>{open} open tasks</span>
              </div>
            </button>
          );
        })}
      </div>

      {canCreateTopLevelTeam(user) && (
        <form onSubmit={addRoot} className="mt-6 flex max-w-md gap-2">
          <input value={newRoot} onChange={(e) => setNewRoot(e.target.value)} placeholder="New top-level team" className={inputCls} />
          <button type="submit" disabled={busy || !newRoot.trim()} className={btnSecondary}>
            <Plus size={14} /> Add
          </button>
        </form>
      )}
      {users.length === 0 && ready && <p className="mt-4 text-sm text-muted">No people have signed in yet.</p>}
      {message && <p className="mt-4 text-sm text-gold-dark">{message}</p>}
    </div>
  );
}

export default function TeamsPage() {
  const { teamsById } = useData();
  const { scopeId, setScope } = useScope();
  const team = scopeId ? teamsById.get(scopeId) : undefined;

  return (
    <div>
      <PageHeader
        title={team ? team.name : "Teams"}
        subtitle={team ? undefined : "The society's structure. Pick a team to see and manage it."}
        actions={
          team && (
            <button onClick={() => setScope(team.parentId)} className={btnGhost}>
              ← {team.parentId ? "Up one level" : "All divisions"}
            </button>
          )
        }
      />
      {team ? (
        // Re-seed local drafts whenever the selected team or its saved values change.
        <TeamPanel
          key={`${team.id}|${team.name}|${team.description}|${team.leadIds.join()}|${team.memberIds.join()}`}
          team={team}
        />
      ) : (
        <Overview />
      )}
    </div>
  );
}
