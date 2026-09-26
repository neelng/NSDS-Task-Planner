import type { AppUser, Team } from "./types";

export interface TeamNode {
  team: Team;
  children: TeamNode[];
  depth: number;
}

export function sortTeams(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function teamMap(teams: Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

export function buildTree(teams: Team[]): TeamNode[] {
  const byParent = new Map<string | null, Team[]>();
  for (const t of sortTeams(teams)) {
    const key = t.parentId;
    const list = byParent.get(key) ?? [];
    list.push(t);
    byParent.set(key, list);
  }
  const build = (parentId: string | null, depth: number): TeamNode[] =>
    (byParent.get(parentId) ?? []).map((team) => ({
      team,
      depth,
      children: build(team.id, depth + 1),
    }));
  return build(null, 0);
}

/** Flatten a tree depth-first, skipping the children of collapsed nodes. */
export function flattenTree(nodes: TeamNode[], collapsed: Set<string>): TeamNode[] {
  const out: TeamNode[] = [];
  const walk = (list: TeamNode[]) => {
    for (const n of list) {
      out.push(n);
      if (!collapsed.has(n.team.id)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** The team and everything beneath it. */
export function subtree(teams: Team[], teamId: string): Team[] {
  return teams.filter((t) => t.path.includes(teamId));
}

export function subtreeIds(teams: Team[], teamId: string): string[] {
  return subtree(teams, teamId).map((t) => t.id);
}

export function breadcrumb(byId: Map<string, Team>, teamId: string, sep = " › "): string {
  const team = byId.get(teamId);
  if (!team) return "Unknown team";
  return team.path.map((id) => byId.get(id)?.name ?? "?").join(sep);
}

export function rootTeamId(team: { path: string[] }): string {
  return team.path[0];
}

/** Everyone who belongs to, or leads, a team or any team beneath it. */
export function peopleInSubtree(teams: Team[], teamId: string): string[] {
  const ids = new Set<string>();
  for (const t of subtree(teams, teamId)) {
    t.memberIds.forEach((id) => ids.add(id));
    t.leadIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}

/** Leads of every team on `path` (root to self), without duplicates. */
export function managerIdsForPath(path: string[], byId: Map<string, Team>): string[] {
  const ids = new Set<string>();
  for (const id of path) byId.get(id)?.leadIds.forEach((u) => ids.add(u));
  return [...ids];
}

/**
 * When a team's leads change, its managerIds and those of every descendant
 * change too. Returns the full set of team updates to write.
 */
export function managerIdUpdatesForLeadChange(
  teams: Team[],
  teamId: string,
  newLeadIds: string[]
): { id: string; managerIds: string[] }[] {
  const byId = teamMap(teams);
  const target = byId.get(teamId);
  if (!target) return [];
  byId.set(teamId, { ...target, leadIds: newLeadIds });
  return subtree(teams, teamId).map((t) => ({
    id: t.id,
    managerIds: managerIdsForPath(t.path, byId),
  }));
}

export function teamsOfUser(teams: Team[], uid: string): Team[] {
  return teams.filter((t) => t.memberIds.includes(uid) || t.leadIds.includes(uid));
}

export function teamsLedBy(teams: Team[], uid: string): Team[] {
  return teams.filter((t) => t.leadIds.includes(uid));
}

export function teamsManagedBy(teams: Team[], uid: string): Team[] {
  return teams.filter((t) => t.managerIds.includes(uid));
}

export type DisplayRole = "Admin" | "Director" | "Lead" | "Member";

/** Badge shown next to a name. "Lead" comes from leading any team. */
export function displayRole(user: AppUser, teams: Team[]): DisplayRole {
  if (user.role === "admin") return "Admin";
  if (user.role === "director") return "Director";
  return teams.some((t) => t.leadIds.includes(user.uid)) ? "Lead" : "Member";
}

// ---------- NSDS org chart seed ----------

export interface SeedNode {
  name: string;
  description: string;
  children?: SeedNode[];
}

export const NSDS_SEED: SeedNode[] = [
  {
    name: "Executive Board",
    description: "President, Vice President and the executive officers.",
  },
  {
    name: "Treasury",
    description: "Overseen by the Treasurer.",
    children: [
      { name: "Grants", description: "Grant Director and Grant Officers." },
      { name: "Audit", description: "Audit Director and Audit Officers." },
      { name: "Sponsorship", description: "Sponsorship Director and Sponsorship Officers." },
    ],
  },
  {
    name: "Operations",
    description: "Overseen by the Secretary.",
    children: [
      { name: "Social Events", description: "Social Events Director and Officers." },
      { name: "Recruitment", description: "Recruitment Director and Officers." },
      { name: "External Relations", description: "External Relations Director and Officers." },
      { name: "Administrative", description: "Administrative Director and Officers." },
      { name: "Professional Events", description: "Professional Events Director and Officers." },
      { name: "Graphic Design", description: "Graphic Design Director and Officers." },
      { name: "Social Media", description: "Social Media Director and Officers." },
    ],
  },
  {
    name: "Technical",
    description: "Overseen by the Chief Engineer. Rename the teams below, then add subteams under each.",
    children: Array.from({ length: 10 }, (_, i) => ({
      name: `Technical Team ${i + 1}`,
      description: "Led by a Project Director. Add subteams beneath it.",
    })),
  },
];

/** Division accent colors (Purdue-adjacent, readable on white). Indexed by top-level team order. */
export const DIVISION_COLORS = [
  "#8E6F3E", // old-gold dark
  "#DAAA00", // boilermaker gold
  "#1F2937", // charcoal
  "#6B7280", // slate
  "#B45309", // amber
  "#0F766E", // teal
  "#7C3AED", // violet
  "#BE123C", // crimson
];
