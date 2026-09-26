export const MAX_NAME_LENGTH = 60;

/** Trim, collapse repeated spaces, and cap the length. */
export function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}

/** The display name shown everywhere: "First Last". */
export function fullName(firstName: string, lastName: string): string {
  return [cleanName(firstName), cleanName(lastName)].filter(Boolean).join(" ");
}
