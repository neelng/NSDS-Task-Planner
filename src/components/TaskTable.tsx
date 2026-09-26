"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useData } from "@/lib/data-context";
import { dueLabel, formatDateRange, isOverdue } from "@/lib/task-utils";
import { breadcrumb } from "@/lib/teams";
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from "@/lib/types";
import Avatar from "./Avatar";
import StatusPill from "./StatusPill";

export type GroupBy = "none" | "team" | "status" | "assignee";
type SortKey = "title" | "team" | "status" | "due" | "priority" | "progress";

const PAGE = 50;
const PRIORITY_RANK = { high: 0, med: 1, low: 2 } as const;
const STATUS_RANK = { blocked: 0, in_progress: 1, not_started: 2, completed: 3 } as const;

export default function TaskTable({
  tasks,
  groupBy,
  onOpen,
}: {
  tasks: Task[];
  groupBy: GroupBy;
  onOpen: (task: Task) => void;
}) {
  const { teamsById, usersById, colorFor } = useData();
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [shown, setShown] = useState<Record<string, number>>({});

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const value = (t: Task): number | string => {
      switch (sortKey) {
        case "title":
          return t.title.toLowerCase();
        case "team":
          return breadcrumb(teamsById, t.teamId).toLowerCase();
        case "status":
          return STATUS_RANK[t.status];
        case "priority":
          return PRIORITY_RANK[t.priority];
        case "progress":
          return t.progress;
        default:
          return t.endDate.toMillis();
      }
    };
    return [...tasks].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [tasks, sortKey, sortDir, teamsById]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", rows: sorted }];
    const map = new Map<string, { label: string; rows: Task[] }>();
    const add = (key: string, label: string, t: Task) => {
      const g = map.get(key) ?? { label, rows: [] };
      g.rows.push(t);
      map.set(key, g);
    };
    for (const t of sorted) {
      if (groupBy === "team") add(t.teamId, breadcrumb(teamsById, t.teamId), t);
      else if (groupBy === "status") add(t.status, STATUS_LABELS[t.status], t);
      else if (t.assigneeIds.length === 0) add("_none", "Unassigned", t);
      else t.assigneeIds.forEach((id) => add(id, usersById.get(id)?.name ?? "Unknown", t));
    }
    return [...map.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([key, g]) => ({ key, ...g }));
  }, [sorted, groupBy, teamsById, usersById]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function header(key: SortKey, label: string, className?: string) {
    const active = sortKey === key;
    return (
      <th className={clsx("px-3 py-2 font-semibold", className)}>
        <button
          onClick={() => toggleSort(key)}
          className={clsx("inline-flex items-center gap-1 uppercase tracking-wide", active && "text-ink")}
        >
          {label}
          {active && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </button>
      </th>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">
        No tasks match these filters.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const limit = shown[group.key] ?? PAGE;
        const rows = group.rows.slice(0, limit);
        return (
          <div key={group.key} className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            {group.label && (
              <div className="border-b border-line bg-gold-tint px-4 py-2 text-sm font-semibold text-gold-dark">
                {group.label}{" "}
                <span className="font-normal text-muted">({group.rows.length})</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-paper text-[11px] text-muted">
                  <tr>
                    {header("title", "Task", "w-[28%]")}
                    {header("team", "Team", "w-[20%]")}
                    <th className="px-3 py-2 font-semibold uppercase tracking-wide">People</th>
                    {header("status", "Status")}
                    {header("priority", "Priority")}
                    {header("due", "Dates")}
                    {header("progress", "Progress")}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const assignees = t.assigneeIds
                      .map((id) => usersById.get(id))
                      .filter((u) => u !== undefined);
                    const overdue = isOverdue(t);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => onOpen(t)}
                        className="cursor-pointer border-t border-line transition hover:bg-gold-tint/60"
                      >
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="h-6 w-1 shrink-0 rounded-full"
                              style={{ backgroundColor: colorFor(t.teamPath) }}
                            />
                            <span className="font-medium text-ink">{t.title}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">
                          {breadcrumb(teamsById, t.teamId)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex -space-x-1.5">
                            {assignees.slice(0, 3).map((u) => (
                              <Avatar key={u.uid} name={u.name} size={22} className="ring-2 ring-white" />
                            ))}
                            {assignees.length > 3 && (
                              <span className="inline-flex h-[22px] items-center rounded-full bg-stone-100 px-1.5 text-[10px] font-semibold text-muted ring-2 ring-white">
                                +{assignees.length - 3}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={t.status} />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">{PRIORITY_LABELS[t.priority]}</td>
                        <td className="px-3 py-2 text-xs">
                          <div className="text-muted">{formatDateRange(t)}</div>
                          <div className={clsx(overdue ? "font-semibold text-red-700" : "text-muted/80")}>
                            {dueLabel(t)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                              <div className="h-full bg-gold-dark" style={{ width: `${t.progress}%` }} />
                            </div>
                            <span className="text-xs text-muted">{t.progress}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {group.rows.length > limit && (
              <button
                onClick={() => setShown((s) => ({ ...s, [group.key]: limit + PAGE }))}
                className="w-full border-t border-line py-2 text-sm font-medium text-gold-dark hover:bg-gold-tint"
              >
                Show more ({group.rows.length - limit} remaining)
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
