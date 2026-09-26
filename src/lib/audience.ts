import type { EmailAudience } from "./email-types";
import type { AppUser, Team } from "./types";

// Pure functions shared by the composer (live recipient count) and the send route,
// which re-runs them server-side so the browser can't dictate who gets emailed.

type UserLike = Pick<AppUser, "uid" | "role">;
type TeamLike = Pick<Team, "id" | "name" | "path" | "leadIds" | "memberIds">;

/** Everyone who belongs to, or leads, the team or any team beneath it. */
function peopleUnder(teams: TeamLike[], teamId: string): string[] {
  const ids = new Set<string>();
  for (const t of teams) {
    if (!t.path.includes(teamId)) continue;
    t.memberIds.forEach((id) => ids.add(id));
    t.leadIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}

export function resolveRecipientUids(
  audience: EmailAudience,
  users: UserLike[],
  teams: TeamLike[]
): string[] {
  const known = new Set(users.map((u) => u.uid));
  let ids: string[] = [];

  switch (audience.kind) {
    case "everyone":
      ids = users.map((u) => u.uid);
      break;
    case "teams":
      ids = (audience.teamIds ?? []).flatMap((id) => peopleUnder(teams, id));
      break;
    case "role":
      if (audience.role === "lead") ids = teams.flatMap((t) => t.leadIds);
      else ids = users.filter((u) => u.role === audience.role).map((u) => u.uid);
      break;
    case "people":
      ids = audience.userIds ?? [];
      break;
  }

  return [...new Set(ids)].filter((id) => known.has(id));
}

export function audienceLabel(audience: EmailAudience, teams: TeamLike[]): string {
  switch (audience.kind) {
    case "everyone":
      return "Everyone";
    case "teams": {
      const names = (audience.teamIds ?? [])
        .map((id) => teams.find((t) => t.id === id)?.name)
        .filter((n): n is string => Boolean(n));
      if (names.length === 0) return "No teams selected";
      const shown = names.slice(0, 3).join(", ");
      return names.length > 3 ? `${shown} +${names.length - 3} more` : shown;
    }
    case "role":
      return audience.role === "lead"
        ? "All team leads"
        : audience.role === "director"
          ? "All directors"
          : "All admins";
    case "people": {
      const n = audience.userIds?.length ?? 0;
      return `${n} selected ${n === 1 ? "person" : "people"}`;
    }
  }
}

/** Teams a person belongs to or leads, first one wins for the {{teamName}} merge tag. */
export function primaryTeamName(teams: TeamLike[], uid: string): string {
  return teams.find((t) => t.memberIds.includes(uid) || t.leadIds.includes(uid))?.name ?? "";
}

/** Fills {{firstName}}, {{name}} and {{teamName}} in a subject or body. */
export function applyMergeTags(
  text: string,
  person: { name: string; teamName: string; firstName?: string }
): string {
  // Prefer the stored first name; fall back to the first word of the display name.
  const first = person.firstName?.trim() || person.name.trim().split(/\s+/)[0] || "there";
  return text
    .replace(/\{\{\s*firstName\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, person.name || "there")
    .replace(/\{\{\s*teamName\s*\}\}/gi, person.teamName || "the society");
}
