"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  watchAllUsers,
  watchOpenTasks,
  watchRecentlyCompleted,
  watchTeams,
} from "./firestore";
import { DIVISION_COLORS, sortTeams } from "./teams";
import type { AppUser, Task, Team } from "./types";

interface DataContextValue {
  /** Accent color of a team's top-level division. */
  colorFor: (teamPath: string[]) => string;
  users: AppUser[];
  usersById: Map<string, AppUser>;
  teams: Team[];
  teamsById: Map<string, Team>;
  /** Open tasks plus tasks completed in the last 14 days. Older completed tasks are in the archive. */
  tasks: Task[];
  ready: boolean;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

/** Mounted only while signed in, so listeners start after login and stop at logout. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState({ users: false, teams: false, open: false, done: false });

  useEffect(() => {
    const mark = (key: keyof typeof loaded) =>
      setLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));

    // If a query fails (for example while a new index is still building) the rest of the app
    // should still open, so a failure counts as "loaded" with no data.
    const unsubs = [
      watchAllUsers(
        (u) => {
          setUsers(u);
          mark("users");
        },
        () => mark("users")
      ),
      watchTeams(
        (t) => {
          setTeams(t);
          mark("teams");
        },
        () => mark("teams")
      ),
      watchOpenTasks(
        (t) => {
          setOpenTasks(t);
          mark("open");
        },
        () => mark("open")
      ),
      watchRecentlyCompleted(
        (t) => {
          setDoneTasks(t);
          mark("done");
        },
        () => mark("done")
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const value = useMemo<DataContextValue>(() => {
    const roots = sortTeams(teams.filter((t) => t.parentId === null));
    const rootColors = new Map(
      roots.map((t, i) => [t.id, DIVISION_COLORS[i % DIVISION_COLORS.length]] as const)
    );
    return {
      colorFor: (teamPath: string[]) => rootColors.get(teamPath[0]) ?? DIVISION_COLORS[0],
      users,
      usersById: new Map(users.map((u) => [u.uid, u])),
      teams,
      teamsById: new Map(teams.map((t) => [t.id, t])),
      tasks: [...openTasks, ...doneTasks],
      ready: loaded.users && loaded.teams && loaded.open && loaded.done,
    };
  }, [users, teams, openTasks, doneTasks, loaded]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
