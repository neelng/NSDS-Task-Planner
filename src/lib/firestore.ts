import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { cleanName, fullName } from "./names";
import { managerIdUpdatesForLeadChange, NSDS_SEED, type SeedNode } from "./teams";
import {
  OPEN_STATUSES,
  type AppUser,
  type EmailTemplate,
  type Role,
  type SentEmail,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateEntry,
  type Team,
} from "./types";

function requireDb() {
  if (!db) throw new Error("Firestore is not configured. Check your .env.local values.");
  return db;
}

/** Logs a listener failure. `onError` lets callers stop waiting on data that will never arrive. */
function logListenerError(label: string, onError?: () => void) {
  return (err: Error) => {
    console.error(`Firestore listener "${label}" failed:`, err);
    onError?.();
  };
}

// ---------- users ----------

export function usersCollection() {
  return collection(requireDb(), "users");
}

/** Fills in fields that documents from an older version of the app may not have. */
function userFromDoc(id: string, data: DocumentData): AppUser {
  return {
    uid: id,
    name: data.name ?? "",
    firstName: data.firstName ?? "",
    lastName: data.lastName ?? "",
    email: data.email ?? "",
    photoURL: data.photoURL ?? null,
    title: data.title ?? "",
    role: data.role === "admin" || data.role === "director" ? data.role : "member",
    hasPassword: data.hasPassword === true,
    createdAt: data.createdAt ?? null,
  };
}

export function watchAllUsers(cb: (users: AppUser[]) => void, onError?: () => void): Unsubscribe {
  return onSnapshot(
    usersCollection(),
    (snap) => cb(snap.docs.map((d) => userFromDoc(d.id, d.data()))),
    logListenerError("users", onError)
  );
}

export async function getUserDoc(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(requireDb(), "users", uid));
  return snap.exists() ? userFromDoc(snap.id, snap.data()) : null;
}

export async function createUserDoc(user: AppUser): Promise<void> {
  await setDoc(doc(requireDb(), "users", user.uid), {
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    photoURL: user.photoURL,
    title: user.title,
    role: user.role,
    hasPassword: false,
    createdAt: serverTimestamp(),
  });
}

/** A person changing their own name. `name` is rebuilt so it always matches. */
export async function updateProfileName(
  uid: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const name = fullName(firstName, lastName);
  await updateDoc(doc(requireDb(), "users", uid), {
    firstName: cleanName(firstName),
    lastName: cleanName(lastName),
    name,
  });
  return name;
}

/** Called once the person has chosen a password, so they aren't asked again. */
export async function markPasswordSet(uid: string): Promise<void> {
  await updateDoc(doc(requireDb(), "users", uid), { hasPassword: true });
}

export async function updateUserRole(uid: string, role: Role): Promise<void> {
  await updateDoc(doc(requireDb(), "users", uid), { role });
}

export async function updateUserTitle(uid: string, title: string): Promise<void> {
  await updateDoc(doc(requireDb(), "users", uid), { title });
}

export async function deleteUserDoc(uid: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "users", uid));
}

// ---------- teams ----------

export function teamsCollection() {
  return collection(requireDb(), "teams");
}

export function watchTeams(cb: (teams: Team[]) => void, onError?: () => void): Unsubscribe {
  return onSnapshot(
    teamsCollection(),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Team, "id">) }))),
    logListenerError("teams", onError)
  );
}

export async function createTeam(input: {
  name: string;
  description: string;
  parent: Team | null;
  order: number;
  createdBy: string;
}): Promise<string> {
  const ref = doc(teamsCollection());
  const { parent } = input;
  await setDoc(ref, {
    name: input.name,
    description: input.description,
    parentId: parent ? parent.id : null,
    path: parent ? [...parent.path, ref.id] : [ref.id],
    leadIds: [],
    // A new team has no leads of its own, so it inherits its ancestors' managers.
    managerIds: parent ? parent.managerIds : [],
    memberIds: [],
    order: input.order,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTeamInfo(
  id: string,
  patch: { name?: string; description?: string }
): Promise<void> {
  await updateDoc(doc(requireDb(), "teams", id), patch);
}

/** Change a team's leads and refresh managerIds on it and every team beneath it. */
export async function setTeamLeads(teams: Team[], teamId: string, leadIds: string[]): Promise<void> {
  const database = requireDb();
  const batch = writeBatch(database);
  for (const u of managerIdUpdatesForLeadChange(teams, teamId, leadIds)) {
    batch.update(
      doc(database, "teams", u.id),
      u.id === teamId ? { leadIds, managerIds: u.managerIds } : { managerIds: u.managerIds }
    );
  }
  await batch.commit();
}

export async function setTeamMembers(teamId: string, memberIds: string[]): Promise<void> {
  await updateDoc(doc(requireDb(), "teams", teamId), { memberIds });
}

/** Returns a message if the team can't be deleted, otherwise deletes it and returns null. */
export async function deleteTeamIfEmpty(teams: Team[], teamId: string): Promise<string | null> {
  if (teams.some((t) => t.parentId === teamId)) {
    return "This team has subteams. Delete them first.";
  }
  const tasks = await getDocs(
    query(tasksCollection(), where("teamPath", "array-contains", teamId), fsLimit(1))
  );
  if (!tasks.empty) {
    return "This team still has tasks (including completed ones). Delete or move them first.";
  }
  await deleteDoc(doc(requireDb(), "teams", teamId));
  return null;
}

/** Create the society's org chart. Callers should only run this when there are no teams. */
export async function seedNsdsStructure(createdBy: string): Promise<number> {
  const database = requireDb();
  const batch = writeBatch(database);
  let count = 0;
  const walk = (nodes: SeedNode[], parent: { id: string; path: string[] } | null) => {
    nodes.forEach((node, index) => {
      const ref = doc(collection(database, "teams"));
      const path = parent ? [...parent.path, ref.id] : [ref.id];
      batch.set(ref, {
        name: node.name,
        description: node.description,
        parentId: parent ? parent.id : null,
        path,
        leadIds: [],
        managerIds: [],
        memberIds: [],
        order: index,
        createdBy,
        createdAt: serverTimestamp(),
      });
      count++;
      if (node.children) walk(node.children, { id: ref.id, path });
    });
  };
  walk(NSDS_SEED, null);
  await batch.commit();
  return count;
}

// ---------- tasks ----------

export function tasksCollection() {
  return collection(requireDb(), "tasks");
}

/** Tasks written by an older version of the app have no team fields and can't be shown. */
function isCurrentTask(d: QueryDocumentSnapshot<DocumentData>): boolean {
  const data = d.data();
  return typeof data.teamId === "string" && Array.isArray(data.teamPath) && Array.isArray(data.assigneeIds);
}

function taskFromDoc(d: QueryDocumentSnapshot<DocumentData>): Task {
  return { id: d.id, ...(d.data() as Omit<Task, "id">) };
}

function currentTasks(docs: QueryDocumentSnapshot<DocumentData>[]): Task[] {
  return docs.filter(isCurrentTask).map(taskFromDoc);
}

/** Every task that isn't completed. This is the working set, so it stays small. */
export function watchOpenTasks(cb: (tasks: Task[]) => void, onError?: () => void): Unsubscribe {
  const q = query(tasksCollection(), where("status", "in", OPEN_STATUSES));
  return onSnapshot(q, (snap) => cb(currentTasks(snap.docs)), logListenerError("open tasks", onError));
}

/** Tasks completed recently, for the Done column. Older ones live in the archive. */
export function watchRecentlyCompleted(
  cb: (tasks: Task[]) => void,
  onError?: () => void,
  days = 14
): Unsubscribe {
  const since = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
  const q = query(
    tasksCollection(),
    where("status", "==", "completed"),
    where("completedAt", ">=", since),
    orderBy("completedAt", "desc")
  );
  return onSnapshot(q, (snap) => cb(currentTasks(snap.docs)), logListenerError("recent tasks", onError));
}

export interface NewTaskInput {
  title: string;
  description: string;
  teamId: string;
  teamPath: string[];
  assigneeIds: string[];
  startDate: Date;
  endDate: Date;
  status: TaskStatus;
  progress: number;
  priority: TaskPriority;
  createdBy: string;
}

export async function createTask(input: NewTaskInput): Promise<string> {
  const ref = await addDoc(tasksCollection(), {
    ...input,
    startDate: Timestamp.fromDate(input.startDate),
    endDate: Timestamp.fromDate(input.endDate),
    completedAt: input.status === "completed" ? serverTimestamp() : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export type TaskPatch = Partial<
  Omit<NewTaskInput, "createdBy" | "startDate" | "endDate"> & { startDate: Date; endDate: Date }
>;

/** Full edit. `prev` is needed so completedAt only changes when status does. */
export async function updateTaskFull(prev: Task, patch: TaskPatch): Promise<void> {
  const { startDate, endDate, ...rest } = patch;
  const data: Record<string, unknown> = { ...rest, updatedAt: serverTimestamp() };
  if (startDate) data.startDate = Timestamp.fromDate(startDate);
  if (endDate) data.endDate = Timestamp.fromDate(endDate);
  if (patch.status && patch.status !== prev.status) {
    data.completedAt = patch.status === "completed" ? serverTimestamp() : null;
  }
  await updateDoc(doc(requireDb(), "tasks", prev.id), data);
}

/** Assignees may only touch these fields (enforced by the security rules). */
export async function updateTaskProgress(
  prev: Task,
  progress: number,
  status: TaskStatus
): Promise<void> {
  const data: Record<string, unknown> = { progress, status, updatedAt: serverTimestamp() };
  if (status !== prev.status) {
    data.completedAt = status === "completed" ? serverTimestamp() : null;
  }
  await updateDoc(doc(requireDb(), "tasks", prev.id), data);
}

export async function deleteTask(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "tasks", id));
}

// ---------- task update log (subcollection) ----------

export function taskUpdatesCollection(taskId: string) {
  return collection(requireDb(), "tasks", taskId, "updates");
}

export async function addTaskUpdateEntry(
  taskId: string,
  authorId: string,
  note: string,
  progress: number
): Promise<void> {
  await addDoc(taskUpdatesCollection(taskId), {
    authorId,
    note,
    progress,
    createdAt: serverTimestamp(),
  });
}

export function watchTaskUpdates(
  taskId: string,
  cb: (entries: TaskUpdateEntry[]) => void
): Unsubscribe {
  const q = query(taskUpdatesCollection(taskId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TaskUpdateEntry, "id">) }))),
    logListenerError("task updates")
  );
}

// ---------- archive (completed tasks, paginated) ----------

export const ARCHIVE_PAGE_SIZE = 25;

export interface ArchiveQuery {
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  teamId?: string | null;
  from?: Date | null;
  to?: Date | null;
}

export async function fetchCompletedTasksPage(opts: ArchiveQuery = {}): Promise<{
  tasks: Task[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  const constraints: QueryConstraint[] = [where("status", "==", "completed")];
  if (opts.teamId) constraints.push(where("teamPath", "array-contains", opts.teamId));
  if (opts.from) constraints.push(where("completedAt", ">=", Timestamp.fromDate(opts.from)));
  if (opts.to) constraints.push(where("completedAt", "<=", Timestamp.fromDate(opts.to)));
  constraints.push(orderBy("completedAt", "desc"));
  if (opts.cursor) constraints.push(startAfter(opts.cursor));
  constraints.push(fsLimit(ARCHIVE_PAGE_SIZE));

  const snap = await getDocs(query(tasksCollection(), ...constraints));
  return {
    tasks: currentTasks(snap.docs),
    lastDoc: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    hasMore: snap.docs.length === ARCHIVE_PAGE_SIZE,
  };
}

// ---------- email templates and sent log ----------

export function watchTemplates(cb: (templates: EmailTemplate[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(requireDb(), "emailTemplates"), orderBy("name")),
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmailTemplate, "id">) }))),
    logListenerError("email templates")
  );
}

export async function saveTemplate(input: {
  id?: string;
  name: string;
  subject: string;
  body: string;
  createdBy: string;
}): Promise<void> {
  const database = requireDb();
  if (input.id) {
    await updateDoc(doc(database, "emailTemplates", input.id), {
      name: input.name,
      subject: input.subject,
      body: input.body,
    });
  } else {
    await addDoc(collection(database, "emailTemplates"), {
      name: input.name,
      subject: input.subject,
      body: input.body,
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
    });
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "emailTemplates", id));
}

/** Pass a uid to see only that person's emails; pass null (admins) to see all. */
export function watchSentEmails(uid: string | null, cb: (sent: SentEmail[]) => void): Unsubscribe {
  const constraints: QueryConstraint[] = [];
  if (uid) constraints.push(where("senderId", "==", uid));
  constraints.push(orderBy("sentAt", "desc"), fsLimit(50));
  return onSnapshot(
    query(collection(requireDb(), "sentEmails"), ...constraints),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SentEmail, "id">) }))),
    logListenerError("sent emails")
  );
}
