"use client";

import clsx from "clsx";
import { Clock } from "lucide-react";
import { useData } from "@/lib/data-context";
import { dueLabel, isOverdue } from "@/lib/task-utils";
import { breadcrumb } from "@/lib/teams";
import type { Task } from "@/lib/types";
import Avatar from "./Avatar";
import StatusPill from "./StatusPill";

/** Compact card used on the board and in "My tasks". */
export default function TaskCard({
  task,
  onClick,
  showStatus = true,
}: {
  task: Task;
  onClick: () => void;
  showStatus?: boolean;
}) {
  const { teamsById, usersById, colorFor } = useData();
  const assignees = task.assigneeIds.map((id) => usersById.get(id)).filter((u) => u !== undefined);
  const overdue = isOverdue(task);

  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-lg border border-line bg-white p-3 pl-4 text-left shadow-sm transition hover:border-gold-dark hover:shadow-md"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: colorFor(task.teamPath) }}
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-snug text-ink">{task.title}</span>
        {showStatus && <StatusPill status={task.status} />}
      </div>
      <p className="mt-1 truncate text-xs text-muted">{breadcrumb(teamsById, task.teamId)}</p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={clsx(
            "inline-flex items-center gap-1 text-xs",
            overdue ? "font-semibold text-red-700" : "text-muted"
          )}
        >
          <Clock size={12} />
          {dueLabel(task)}
        </span>
        <span className="flex -space-x-1.5">
          {assignees.slice(0, 4).map((u) => (
            <Avatar key={u.uid} name={u.name} size={22} className="ring-2 ring-white" />
          ))}
          {assignees.length > 4 && (
            <span className="inline-flex h-[22px] items-center rounded-full bg-stone-100 px-1.5 text-[10px] font-semibold text-muted ring-2 ring-white">
              +{assignees.length - 4}
            </span>
          )}
        </span>
      </div>

      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-gold-dark"
          style={{ width: `${task.progress}%` }}
        />
      </div>
    </button>
  );
}
