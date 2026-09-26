import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { applyMergeTags, audienceLabel, primaryTeamName, resolveRecipientUids } from "@/lib/audience";
import {
  MAX_RECIPIENTS_PER_SEND,
  type AnnouncementRequest,
  type SendEmailResponse,
  type TaskAssignedRequest,
} from "@/lib/email-types";
import { renderEmailHtml, renderEmailText } from "@/lib/email-render";
import { adminAuth, adminDb, isAdminConfigured } from "@/lib/server/firebase-admin";
import { fromAddress, getTransporter, isMailerConfigured } from "@/lib/server/mailer";
import type { Role } from "@/lib/types";

// Sending one email at a time through SMTP is slow; allow the function to run up to a minute.
export const maxDuration = 60;

const ALLOWED_DOMAIN = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "purdue.edu").toLowerCase();
const MAX_ANNOUNCEMENTS_PER_HOUR = 10;
const MAX_TASK_EMAILS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

interface Caller {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

interface UserRow {
  uid: string;
  name: string;
  firstName: string;
  email: string;
  role: Role;
}

interface TeamRow {
  id: string;
  name: string;
  path: string[];
  leadIds: string[];
  memberIds: string[];
  managerIds: string[];
}

async function authenticate(request: Request): Promise<Caller> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in again and retry.");

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token);
  } catch {
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }
  const email = (decoded.email ?? "").toLowerCase();
  if (!decoded.email_verified || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new HttpError(403, "This account is not allowed to send email.");
  }

  const snap = await adminDb().doc(`users/${decoded.uid}`).get();
  if (!snap.exists) throw new HttpError(403, "No profile was found for your account.");
  const data = snap.data() ?? {};
  return { uid: decoded.uid, email, name: (data.name as string) || email, role: data.role as Role };
}

async function loadUsers(): Promise<UserRow[]> {
  const snap = await adminDb().collection("users").get();
  return snap.docs.map((d: QueryDocumentSnapshot) => {
    const x = d.data();
    return {
      uid: d.id,
      name: (x.name as string) ?? "",
      firstName: (x.firstName as string) ?? "",
      email: (x.email as string) ?? "",
      role: ((x.role as Role) ?? "member") as Role,
    };
  });
}

async function loadTeams(): Promise<TeamRow[]> {
  const snap = await adminDb().collection("teams").get();
  return snap.docs.map((d: QueryDocumentSnapshot) => {
    const x = d.data();
    return {
      id: d.id,
      name: (x.name as string) ?? "",
      path: (x.path as string[]) ?? [],
      leadIds: (x.leadIds as string[]) ?? [],
      memberIds: (x.memberIds as string[]) ?? [],
      managerIds: (x.managerIds as string[]) ?? [],
    };
  });
}

interface OutgoingMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendAll(messages: OutgoingMessage[], replyTo: string) {
  const transport = getTransporter();
  const errors: string[] = [];
  let sent = 0;
  // Small batches keep us well inside SMTP provider connection limits.
  for (let i = 0; i < messages.length; i += 5) {
    const batch = messages.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((m) => transport.sendMail({ from: fromAddress(), replyTo, ...m }))
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") sent += 1;
      else errors.push(`${batch[idx].to}: ${(r.reason as Error).message}`);
    });
  }
  return { sent, failed: messages.length - sent, errors: errors.slice(0, 5) };
}

async function recentSendCount(uid: string): Promise<number> {
  const snap = await adminDb()
    .collection("sentEmails")
    .where("senderId", "==", uid)
    .where("sentAt", ">=", Timestamp.fromMillis(Date.now() - HOUR_MS))
    .orderBy("sentAt", "desc")
    .limit(MAX_ANNOUNCEMENTS_PER_HOUR + 1)
    .get();
  return snap.size;
}

async function handleAnnouncement(
  req: AnnouncementRequest,
  caller: Caller,
  appUrl: string
): Promise<SendEmailResponse> {
  if (caller.role !== "admin" && caller.role !== "director") {
    throw new HttpError(403, "Only admins and directors can send announcements.");
  }
  const subject = (req.subject ?? "").trim();
  const body = (req.body ?? "").trim();
  if (!subject || !body) throw new HttpError(400, "Add a subject and a message.");
  if (subject.length > 200 || body.length > 20000) throw new HttpError(400, "That message is too long.");
  if (!req.test && typeof req.audience?.kind !== "string") throw new HttpError(400, "Choose who to send this to.");

  const [users, teams] = await Promise.all([loadUsers(), loadTeams()]);
  const usersById = new Map(users.map((u) => [u.uid, u]));

  let uids: string[];
  let label: string;

  if (req.test) {
    uids = [caller.uid];
    label = "Test to self";
  } else {
    if (caller.role !== "admin") {
      // Directors may only reach people inside the teams they lead.
      const managed = teams.filter((t) => t.managerIds.includes(caller.uid));
      if (managed.length === 0) throw new HttpError(403, "You don't lead any teams yet.");
      if (req.audience.kind !== "teams" && req.audience.kind !== "people") {
        throw new HttpError(403, "Directors can email teams they lead, or people within them.");
      }
      const managedIds = managed.map((t) => t.id);
      if (
        req.audience.kind === "teams" &&
        !(req.audience.teamIds ?? []).every((id) => managedIds.includes(id))
      ) {
        throw new HttpError(403, "You can only email teams you lead.");
      }
      const scope = new Set(resolveRecipientUids({ kind: "teams", teamIds: managedIds }, users, teams));
      const requested = resolveRecipientUids(req.audience, users, teams);
      if (!requested.every((id) => scope.has(id))) {
        throw new HttpError(403, "You can only email people in your own teams.");
      }
    }
    uids = resolveRecipientUids(req.audience, users, teams);
    label = audienceLabel(req.audience, teams);

    if (uids.length === 0) throw new HttpError(400, "That audience has no recipients.");
    if (uids.length > MAX_RECIPIENTS_PER_SEND) {
      throw new HttpError(
        400,
        `That audience has ${uids.length} people; the limit is ${MAX_RECIPIENTS_PER_SEND} per send. Send by division instead.`
      );
    }
    if ((await recentSendCount(caller.uid)) >= MAX_ANNOUNCEMENTS_PER_HOUR) {
      throw new HttpError(429, "You've sent a lot of emails in the last hour. Try again later.");
    }
  }

  const recipients = uids
    .map((id) => usersById.get(id))
    .filter((u): u is UserRow => Boolean(u?.email));

  const messages: OutgoingMessage[] = recipients.map((u) => {
    const person = { name: u.name, firstName: u.firstName, teamName: primaryTeamName(teams, u.uid) };
    const heading = applyMergeTags(subject, person);
    const content = {
      heading,
      body: applyMergeTags(body, person),
      senderName: caller.name,
      appUrl,
    };
    return {
      to: u.email,
      subject: req.test ? `[Test] ${heading}` : heading,
      html: renderEmailHtml(content),
      text: renderEmailText(content),
    };
  });

  const result = await sendAll(messages, caller.email);

  await adminDb().collection("sentEmails").add({
    senderId: caller.uid,
    subject,
    audienceLabel: label,
    recipientCount: messages.length,
    failedCount: result.failed,
    sentAt: FieldValue.serverTimestamp(),
  });

  return { ...result, recipientCount: messages.length, audienceLabel: label };
}

const taskEmailLog = new Map<string, number[]>();

function underTaskEmailLimit(uid: string, adding: number): boolean {
  const now = Date.now();
  const recent = (taskEmailLog.get(uid) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length + adding > MAX_TASK_EMAILS_PER_HOUR) return false;
  taskEmailLog.set(uid, [...recent, ...Array(adding).fill(now)]);
  return true;
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Indiana/Indianapolis",
  });
}

async function handleTaskAssigned(
  req: TaskAssignedRequest,
  caller: Caller,
  appUrl: string
): Promise<SendEmailResponse> {
  const db = adminDb();
  const taskSnap = await db.doc(`tasks/${req.taskId}`).get();
  if (!taskSnap.exists) throw new HttpError(404, "That task no longer exists.");
  const task = taskSnap.data() ?? {};

  const teamSnap = await db.doc(`teams/${task.teamId}`).get();
  const managerIds = (teamSnap.data()?.managerIds as string[] | undefined) ?? [];
  if (caller.role !== "admin" && !managerIds.includes(caller.uid)) {
    throw new HttpError(403, "You can only email people about tasks you manage.");
  }

  // Only people actually on the task, and never the sender.
  const assigned = new Set<string>((task.assigneeIds as string[]) ?? []);
  const targets = [...new Set(req.assigneeIds ?? [])]
    .filter((id) => assigned.has(id) && id !== caller.uid)
    .slice(0, 25);
  const label = "Task assignment";
  if (targets.length === 0) return { sent: 0, failed: 0, recipientCount: 0, audienceLabel: label };
  if (!underTaskEmailLimit(caller.uid, targets.length)) {
    throw new HttpError(429, "Too many assignment emails in the last hour. Try again later.");
  }

  const pathNames = await Promise.all(
    ((task.teamPath as string[]) ?? []).map(async (id) => ((await db.doc(`teams/${id}`).get()).data()?.name as string) ?? "?")
  );
  const userSnaps = await Promise.all(targets.map((id) => db.doc(`users/${id}`).get()));

  const details = [
    { label: "Task", value: String(task.title ?? "") },
    { label: "Team", value: pathNames.join(" › ") },
    { label: "Starts", value: formatDay((task.startDate as Timestamp).toMillis()) },
    { label: "Due", value: formatDay((task.endDate as Timestamp).toMillis()) },
    ...(task.description ? [{ label: "Details", value: String(task.description).slice(0, 400) }] : []),
  ];

  const messages: OutgoingMessage[] = userSnaps
    .filter((s: DocumentSnapshot) => s.exists && s.data()?.email)
    .map((s: DocumentSnapshot) => {
      const first =
        String(s.data()?.firstName ?? "").trim() ||
        String(s.data()?.name ?? "").trim().split(/\s+/)[0] ||
        "there";
      const content = {
        heading: `New task: ${task.title}`,
        body: `Hi ${first},\n\n${caller.name} assigned you a task.`,
        senderName: caller.name,
        appUrl,
        details,
        buttonLabel: "Open the task planner",
      };
      return {
        to: String(s.data()?.email),
        subject: `New task assigned: ${task.title}`,
        html: renderEmailHtml(content),
        text: renderEmailText(content),
      };
    });

  const result = await sendAll(messages, caller.email);
  return { ...result, recipientCount: messages.length, audienceLabel: label };
}

export async function POST(request: Request) {
  try {
    if (!isAdminConfigured()) {
      throw new HttpError(503, "Email isn't set up on the server yet (missing FIREBASE_SERVICE_ACCOUNT).");
    }
    if (!isMailerConfigured()) {
      throw new HttpError(503, "Email isn't set up on the server yet (missing SMTP settings).");
    }

    const caller = await authenticate(request);
    const payload = (await request.json().catch(() => null)) as
      | AnnouncementRequest
      | TaskAssignedRequest
      | null;
    if (!payload || typeof payload !== "object") throw new HttpError(400, "Invalid request.");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    if (payload.mode === "announcement") {
      return Response.json(await handleAnnouncement(payload, caller, appUrl));
    }
    if (payload.mode === "task-assigned") {
      return Response.json(await handleTaskAssigned(payload, caller, appUrl));
    }
    throw new HttpError(400, "Unknown request type.");
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
    console.error("send-email failed:", err);
    return Response.json({ error: "Something went wrong sending the email." }, { status: 500 });
  }
}
