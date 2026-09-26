"use client";

import { useMemo } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useData } from "@/lib/data-context";
import { breadcrumb } from "@/lib/teams";
import type { Task } from "@/lib/types";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: enUS }),
  getDay,
  locales: { "en-US": enUS },
});

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  done: boolean;
  task: Task;
}

export default function CalendarView({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
}) {
  const { teamsById, colorFor } = useData();

  const events: CalendarEvent[] = useMemo(
    () =>
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        start: t.startDate.toDate(),
        end: t.endDate.toDate(),
        color: colorFor(t.teamPath),
        done: t.status === "completed",
        task: t,
      })),
    [tasks, colorFor]
  );

  return (
    <div className="h-[74vh] min-h-[480px] rounded-xl border border-line bg-white p-3 shadow-sm">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        allDayAccessor={() => true}
        views={["month", "week", "agenda"] as View[]}
        defaultView="month"
        popup
        onSelectEvent={(e) => onSelect((e as CalendarEvent).task)}
        tooltipAccessor={(e) => `${e.title} · ${breadcrumb(teamsById, (e as CalendarEvent).task.teamId)}`}
        eventPropGetter={(event) => {
          const ev = event as CalendarEvent;
          return {
            style: {
              backgroundColor: ev.color,
              borderColor: ev.color,
              color: "#fff",
              opacity: ev.done ? 0.55 : 1,
              textDecoration: ev.done ? "line-through" : "none",
            },
          };
        }}
      />
    </div>
  );
}
