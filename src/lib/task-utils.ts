import type { Timestamp } from "firebase/firestore";
import { breadcrumb } from "./teams";
import type { AppUser, Task, TaskPriority, TaskStatus, Team } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TaskFilter {
  search: string;
  /** "open" hides completed tasks; "all" includes recently completed ones. */
  status: TaskStatus | "open" | "all";
  priority: TaskPriority | "all";
  assigneeId: string | "all";
  due: "any" | "overdue" | "week" | "month";
}

export const EMPTY_FILTER: TaskFilter = {
  search: "",
  status: "open",
  priority: "all",
  assigneeId: "all",
  due: "any",
};

export function filterTasks(
  tasks: Task[],
  f: TaskFilter,
  ctx: { usersById: Map<string, AppUser>; teamsById: Map<string, Team> }
): Task[] {
  const needle = f.search.trim().toLowerCase();
  const now = Date.now();
  return tasks.filter((t) => {
    if (f.status === "open" ? t.status === "completed" : f.status !== "all" && t.status !== f.status) {
      return false;
    }
    if (f.priority !== "all" && t.priority !== f.priority) return false;
    if (f.assigneeId !== "all" && !t.assigneeIds.includes(f.assigneeId)) return false;
    if (f.due !== "any") {
      if (t.status === "completed") return false;
      const end = t.endDate.toMillis();
      if (f.due === "overdue" && end >= now) return false;
      if (f.due === "week" && (end < now || end > now + 7 * DAY_MS)) return false;
      if (f.due === "month" && (end < now || end > now + 30 * DAY_MS)) return false;
    }
    if (needle) {
      const hay = [
        t.title,
        t.description,
        breadcrumb(ctx.teamsById, t.teamId),
        ...t.assigneeIds.map((id) => ctx.usersById.get(id)?.name ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function isOverdue(task: Task, now = Date.now()): boolean {
  return task.status !== "completed" && task.endDate.toMillis() < now;
}

export function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  const d = ts.toDate();
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatDateRange(task: Pick<Task, "startDate" | "endDate">): string {
  return `${formatDate(task.startDate)} – ${formatDate(task.endDate)}`;
}

/** "Overdue 3d", "Due today", "Due in 2d", or a date further out. */
export function dueLabel(task: Task, now = Date.now()): string {
  if (task.status === "completed") return "Done";
  const end = task.endDate.toMillis();
  if (end < now) {
    const days = Math.max(1, Math.floor((now - end) / DAY_MS));
    return `Overdue ${days}d`;
  }
  const days = Math.ceil((end - now) / DAY_MS);
  if (days <= 1) return "Due today";
  if (days <= 14) return `Due in ${days}d`;
  return `Due ${formatDate(task.endDate)}`;
}

/** Value for <input type="date"> in the user's local time zone. */
export function toDateInputValue(input: Timestamp | Date | null | undefined): string {
  if (!input) return "";
  const d = "toDate" in input ? input.toDate() : input;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Parse an <input type="date"> value as a local date. Start dates use the start of the day and
 * end dates use the end of it, so a task due on the 20th is not overdue until the 21st.
 */
export function parseDateInput(value: string, endOfDay: boolean): Date {
  const [y, m, d] = value.split("-").map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
