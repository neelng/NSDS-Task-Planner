"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { LayoutGrid, Plus, Search, Table2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { manageableTeams } from "@/lib/permissions";
import { EMPTY_FILTER, filterTasks, type TaskFilter } from "@/lib/task-utils";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/types";
import { btnPrimary, btnGhost, inputCls } from "@/lib/ui";
import { inScope, useScope } from "@/lib/use-scope";
import PageHeader from "@/components/PageHeader";
import TaskBoard from "@/components/TaskBoard";
import TaskTable, { type GroupBy } from "@/components/TaskTable";
import { useTaskModal } from "@/components/use-task-modal";

export default function TasksPage() {
  const { user } = useAuth();
  const { tasks, teams, users, teamsById, usersById, ready } = useData();
  const { scopeId } = useScope();
  const { openCreate, openEdit, modal } = useTaskModal(scopeId);

  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [view, setView] = useState<"table" | "board">("table");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const canCreate = manageableTeams(user, teams).length > 0;
  const set = <K extends keyof TaskFilter>(key: K, value: TaskFilter[K]) =>
    setFilter((f) => ({ ...f, [key]: value }));

  const visible = useMemo(() => {
    // The board always shows its Done column, so "open only" doesn't apply there.
    const effective = view === "board" && filter.status === "open" ? { ...filter, status: "all" as const } : filter;
    return filterTasks(
      tasks.filter((t) => inScope(t.teamPath, scopeId)),
      effective,
      { usersById, teamsById }
    );
  }, [tasks, scopeId, filter, view, usersById, teamsById]);

  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const filtersActive = JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER);

  return (
    <div>
      <PageHeader
        title="All tasks"
        subtitle={`${visible.length} task${visible.length === 1 ? "" : "s"}`}
        actions={
          <>
            <div className="flex rounded-md border border-line bg-white p-0.5">
              {(
                [
                  ["table", Table2, "Table"],
                  ["board", LayoutGrid, "Board"],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition",
                    view === key ? "bg-ink text-gold" : "text-muted hover:text-ink"
                  )}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            {canCreate && (
              <button onClick={openCreate} className={btnPrimary}>
                <Plus size={16} /> New task
              </button>
            )}
          </>
        }
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={filter.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search tasks, teams, people…"
            className={clsx(inputCls, "pl-8")}
          />
        </div>
        <select value={filter.status} onChange={(e) => set("status", e.target.value as TaskFilter["status"])} className={inputCls}>
          <option value="open">Open tasks</option>
          <option value="all">All incl. recently done</option>
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select value={filter.priority} onChange={(e) => set("priority", e.target.value as TaskFilter["priority"])} className={inputCls}>
          <option value="all">Any priority</option>
          {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select value={filter.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} className={inputCls}>
          <option value="all">Anyone</option>
          {sortedUsers.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={filter.due} onChange={(e) => set("due", e.target.value as TaskFilter["due"])} className={inputCls}>
          <option value="any">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due in 7 days</option>
          <option value="month">Due in 30 days</option>
        </select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {view === "table" && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Group by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={clsx(inputCls, "w-auto py-1")}>
              <option value="none">Nothing</option>
              <option value="team">Team</option>
              <option value="status">Status</option>
              <option value="assignee">Person</option>
            </select>
          </label>
        )}
        {filtersActive && (
          <button onClick={() => setFilter(EMPTY_FILTER)} className={btnGhost}>
            Clear filters
          </button>
        )}
      </div>

      {!ready ? (
        <p className="text-sm text-muted">Loading tasks…</p>
      ) : view === "table" ? (
        <TaskTable tasks={visible} groupBy={groupBy} onOpen={openEdit} />
      ) : (
        <TaskBoard tasks={visible} onOpen={openEdit} />
      )}

      {modal}
    </div>
  );
}
