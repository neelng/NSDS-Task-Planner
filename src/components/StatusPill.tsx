import clsx from "clsx";
import { STATUS_LABELS, type TaskStatus } from "@/lib/types";

const STYLES: Record<TaskStatus, string> = {
  not_started: "bg-stone-100 text-stone-600 ring-stone-200",
  in_progress: "bg-gold-tint text-gold-dark ring-gold/60",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blocked: "bg-red-50 text-red-700 ring-red-200",
};

export default function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
        STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
