import type { Timestamp } from "firebase/firestore";

/**
 * Tier stored on the user doc. Being a "lead" is not a role: it comes from
 * appearing in a team's leadIds (see Team.managerIds).
 */
export type Role = "admin" | "director" | "member";

export interface AppUser {
  uid: string;
  /** Display name, "First Last". Kept in sync with firstName and lastName. */
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  photoURL: string | null;
  /** Display title, e.g. "Vice President". Admin-editable, purely a label. */
  title: string;
  role: Role;
  /** False until the person has chosen a password after their first sign-in link. */
  hasPassword: boolean;
  createdAt: Timestamp | null;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  /** Ancestor ids from the root down to and including this team. */
  path: string[];
  leadIds: string[];
  /** Leads of this team and of every ancestor. Used by security rules. */
  managerIds: string[];
  memberIds: string[];
  order: number;
  createdBy: string;
  createdAt: Timestamp | null;
}

export type TaskStatus = "not_started" | "in_progress" | "completed" | "blocked";
export type TaskPriority = "low" | "med" | "high";

export const OPEN_STATUSES: TaskStatus[] = ["not_started", "in_progress", "blocked"];

export interface Task {
  id: string;
  title: string;
  description: string;
  teamId: string;
  /** Copy of the team's path, so a whole subtree can be queried. */
  teamPath: string[];
  assigneeIds: string[];
  startDate: Timestamp;
  endDate: Timestamp;
  status: TaskStatus;
  progress: number;
  priority: TaskPriority;
  completedAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TaskUpdateEntry {
  id: string;
  authorId: string;
  note: string;
  progress: number;
  createdAt: Timestamp | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdBy: string;
  createdAt: Timestamp | null;
}

export interface SentEmail {
  id: string;
  senderId: string;
  subject: string;
  audienceLabel: string;
  recipientCount: number;
  failedCount: number;
  sentAt: Timestamp | null;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  director: "Director",
  member: "Member",
};
