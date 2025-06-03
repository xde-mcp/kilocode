import { UserProfile } from "../models/User";

// This will be renamed in test case 1
export function formatFullName(user: UserProfile): string {
  return `${user.firstName} ${user.lastName}`.trim() || "Unnamed User";
}

export function formatEmail(email: string): string {
  const [username, domain] = email.split("@");
  if (!domain) return email;

  return `${username.substring(0, 3)}...@${domain}`;
}

// This will be used for the date formatting rename test
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

// This will be removed in test case 3
export function deprecatedHelper(value: string): string {
  return value.toLowerCase();
}

export function formatUserSummary(user: UserProfile): string {
  return `${formatFullName(user)} (${formatEmail(user.email)})`;
}