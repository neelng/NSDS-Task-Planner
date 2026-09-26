// Shared by the browser (composer, task modal) and the /api/send-email route.

export type AudienceKind = "everyone" | "teams" | "role" | "people";

export interface EmailAudience {
  kind: AudienceKind;
  /** kind "teams": each team plus everyone beneath it. */
  teamIds?: string[];
  /** kind "role": "admin" | "director" | "lead" (leads of any team). */
  role?: "admin" | "director" | "lead";
  /** kind "people": specific user ids. */
  userIds?: string[];
}

export interface AnnouncementRequest {
  mode: "announcement";
  audience: EmailAudience;
  subject: string;
  body: string;
  /** Send only to the caller, to preview how it looks. */
  test?: boolean;
}

export interface TaskAssignedRequest {
  mode: "task-assigned";
  taskId: string;
  /** People newly added to the task. */
  assigneeIds: string[];
}

export type SendEmailRequest = AnnouncementRequest | TaskAssignedRequest;

export interface SendEmailResponse {
  sent: number;
  failed: number;
  recipientCount: number;
  audienceLabel: string;
  errors?: string[];
}

/** Largest number of recipients one send may target. */
export const MAX_RECIPIENTS_PER_SEND = 150;
