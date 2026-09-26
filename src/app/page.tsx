"use client";

import { useMemo } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { isAdmin, manageableTeams } from "@/lib/permissions";
import { useNow } from "@/lib/use-now";
import { inScope, useScope, withScope } from "@/lib/use-scope";
import type { Task } from "@/lib/types";
import { btnPrimary, card } from "@/lib/ui";
import PageHeader from "@/components/PageHeader";
import TaskCard from "@/components/TaskCard";
import { useTaskModal } from "@/components/use-task-modal";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function Stat({ label, value, tone }: { label: string; value: number; tone?: "alert" }) {
  return (
    <div className={clsx(card, "px-4 py-3")}>
      <div
        className={clsx(
          "font-display text-3xl font-semibold",
          tone === "alert" && value > 0 ? "text-red-700" : "text-ink"
        )}
      >
        {value}
      </div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function Column({
  title,
  tasks,
  onOpen,
  empty,
}: {
  title: string;
  tasks: Task[];
  onOpen: (t: Task) => void;
  empty: string;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
        <span className="rounded-full bg-white px-2 py-0.5 text-ink ring-1 ring-line">{tasks.length}</span>
      </h3>
      <div className="space-y-2">
        {tasks.slice(0, 8).map((t) => (
          <TaskCard key={t.id} task={t} onClick={() => onOpen(t)} />
        ))}
        {tasks.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">{empty}</p>}
        {tasks.length > 8 && (
          <p className="px-1 text-xs text-muted">+{tasks.length - 8} more in All tasks</p>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { tasks, teams, ready } = useData();
  const { scopeId } = useScope();
  const { openCreate, openEdit, modal } = useTaskModal(scopeId);

  const canCreate = manageableTeams(user, teams).length > 0;

  const now = useNow();

  const { mine, pulse, doneByMe } = useMemo(() => {
    const managed = new Set(manageableTeams(user, teams).map((t) => t.id));
    const admin = isAdmin(user);
    const scoped = tasks.filter((t) => inScope(t.teamPath, scopeId));
    const open = scoped.filter((t) => t.status !== "completed");
    const mineOpen = open
      .filter((t) => user && t.assigneeIds.includes(user.uid))
      .sort((a, b) => a.endDate.toMillis() - b.endDate.toMillis());
    const managedOpen = open.filter((t) => admin || t.teamPath.some((id) => managed.has(id)));
    return {
      mine: {
        overdue: mineOpen.filter((t) => t.endDate.toMillis() < now),
        week: mineOpen.filter((t) => t.endDate.toMillis() >= now && t.endDate.toMillis() <= now + WEEK_MS),
        later: mineOpen.filter((t) => t.endDate.toMillis() > now + WEEK_MS),
        all: mineOpen,
      },
      pulse: {
        overdue: managedOpen.filter((t) => t.endDate.toMillis() < now),
        blocked: managedOpen.filter((t) => t.status === "blocked"),
        week: managedOpen.filter((t) => t.endDate.toMillis() >= now && t.endDate.toMillis() <= now + WEEK_MS),
        isManager: admin || managed.size > 0,
      },
      doneByMe: scoped.filter(
        (t) => t.status === "completed" && user && t.assigneeIds.includes(user.uid)
      ).length,
    };
  }, [tasks, teams, user, scopeId, now]);

  if (!user) return null;
  const firstName = user.name.split(" ")[0];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Your tasks, and what needs attention across your teams."
        actions={
          canCreate && (
            <button onClick={openCreate} className={btnPrimary}>
              <Plus size={16} /> New task
            </button>
          )
        }
      />

      {ready && teams.length === 0 && (
        <div className={clsx(card, "mb-6 border-gold px-5 py-4 text-sm")}>
          <p className="font-semibold text-ink">No teams have been set up yet.</p>
          <p className="mt-1 text-muted">
            {isAdmin(user) ? (
              <>
                Head to{" "}
                <Link href="/teams" className="font-semibold text-gold-dark underline">
                  Teams
                </Link>{" "}
                and use “Set up NSDS structure” to create the org chart in one click.
              </>
            ) : (
              "An admin needs to set up the team structure before tasks can be created."
            )}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="My open tasks" value={mine.all.length} />
        <Stat label="Due this week" value={mine.week.length} />
        <Stat label="Overdue" value={mine.overdue.length} tone="alert" />
        <Stat label="Completed (14 days)" value={doneByMe} />
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold tracking-wide text-ink">Assigned to me</h2>
      {!ready ? (
        <p className="text-sm text-muted">Loading tasks…</p>
      ) : mine.all.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center text-sm text-muted">
          Nothing assigned to you right now.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Column title="Overdue" tasks={mine.overdue} onOpen={openEdit} empty="Nothing overdue" />
          <Column title="Due this week" tasks={mine.week} onOpen={openEdit} empty="Nothing due this week" />
          <Column title="Later" tasks={mine.later} onOpen={openEdit} empty="Nothing further out" />
        </div>
      )}

      {ready && pulse.isManager && (
        <>
          <div className="mb-3 mt-10 flex items-end justify-between">
            <h2 className="font-display text-lg font-semibold tracking-wide text-ink">Team pulse</h2>
            <Link
              href={withScope("/tasks", scopeId)}
              className="text-sm font-medium text-gold-dark hover:underline"
            >
              View all tasks →
            </Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Column title="Overdue" tasks={pulse.overdue} onOpen={openEdit} empty="Nothing overdue" />
            <Column title="Blocked" tasks={pulse.blocked} onOpen={openEdit} empty="Nothing blocked" />
            <Column title="Due this week" tasks={pulse.week} onOpen={openEdit} empty="Nothing due this week" />
          </div>
        </>
      )}

      {modal}
    </div>
  );
}
