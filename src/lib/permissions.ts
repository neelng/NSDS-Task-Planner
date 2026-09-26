import type { AppUser, Task, Team } from "./types";

// These mirror firestore.rules and only decide what the UI shows.
// The rules are what actually enforce access.

export function isAdmin(user: AppUser | null): boolean {
  return user?.role === "admin";
}

export function isDirector(user: AppUser | null): boolean {
  return user?.role === "director";
}

/** True when the user leads this team or any team above it. */
export function isManagerOf(user: AppUser | null, team: Team | null | undefined): boolean {
  return Boolean(user && team && team.managerIds.includes(user.uid));
}

/** Create and edit tasks in a team. */
export function canManageTasks(user: AppUser | null, team: Team | null | undefined): boolean {
  return isAdmin(user) || isManagerOf(user, team);
}

export const canCreateTask = canManageTasks;
export const canEditTaskFully = canManageTasks;

/** Delete tasks: admins anywhere, directors within their own subtree. */
export function canDeleteTask(user: AppUser | null, team: Team | null | undefined): boolean {
  return isAdmin(user) || (isDirector(user) && isManagerOf(user, team));
}

/** Add, rename and delete child teams, and appoint leads. */
export function canManageTeamStructure(user: AppUser | null, team: Team | null | undefined): boolean {
  return isAdmin(user) || (isDirector(user) && isManagerOf(user, team));
}

/** Only admins create top-level teams. */
export function canCreateTopLevelTeam(user: AppUser | null): boolean {
  return isAdmin(user);
}

/** Add and remove people in a team. Any lead above the team can. */
export function canManageMembers(user: AppUser | null, team: Team | null | undefined): boolean {
  return isAdmin(user) || isManagerOf(user, team);
}

/** Members may update progress on tasks assigned to them. */
export function canUpdateOwnProgress(user: AppUser | null, task: Task | null | undefined): boolean {
  if (!user || !task) return false;
  return task.assigneeIds.includes(user.uid);
}

export function canSendEmail(user: AppUser | null): boolean {
  return isAdmin(user) || isDirector(user);
}

export function canViewAdminPanel(user: AppUser | null): boolean {
  return isAdmin(user);
}

/** Teams this user may create tasks in. */
export function manageableTeams(user: AppUser | null, teams: Team[]): Team[] {
  if (!user) return [];
  if (isAdmin(user)) return teams;
  return teams.filter((t) => t.managerIds.includes(user.uid));
}

/** Which task fields the user may change when editing an existing task. */
export function editableFieldsFor(
  user: AppUser | null,
  team: Team | null | undefined,
  task?: Task | null
): "all" | "progress-only" | "none" {
  if (canManageTasks(user, team)) return "all";
  if (task && canUpdateOwnProgress(user, task)) return "progress-only";
  return "none";
}
