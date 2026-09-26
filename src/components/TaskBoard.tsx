"use client";

import { useState } from "react";
import { STATUS_LABELS, type Task, type TaskStatus } from "@/lib/types";
import TaskCard from "./TaskCard";

const COLUMNS: TaskStatus[] = ["not_started", "in_progress", "blocked", "completed"];
const PAGE = 30;

export default function TaskBoard({
  tasks,
  onOpen,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
}) {
  const [shown, setShown] = useState<Record<string, number>>({});

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((status) => {
        const all = tasks
          .filter((t) => t.status === status)
          .sort((a, b) => a.endDate.toMillis() - b.endDate.toMillis());
        const limit = shown[status] ?? PAGE;
        return (
          <section key={status} className="rounded-xl bg-stone-100/70 p-3">
            <h2 className="mb-3 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              <span>
                {STATUS_LABELS[status]}
                {status === "completed" && <span className="font-normal normal-case"> · last 14 days</span>}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-ink ring-1 ring-line">
                {all.length}
              </span>
            </h2>
            <div className="space-y-2">
              {all.slice(0, limit).map((t) => (
                <TaskCard key={t.id} task={t} onClick={() => onOpen(t)} showStatus={false} />
              ))}
              {all.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted/70">No tasks</p>}
              {all.length > limit && (
                <button
                  onClick={() => setShown((s) => ({ ...s, [status]: limit + PAGE }))}
                  className="w-full rounded-md py-1.5 text-xs font-medium text-gold-dark hover:bg-white"
                >
                  Show more ({all.length - limit})
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
