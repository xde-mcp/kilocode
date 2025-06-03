import { UserProfile, createDefaultUser } from "../models/User";
import { formatFullName, formatEmail } from "../utils/formatting";

// This will be moved to validation.ts in test case 2

export function updateUserProfile(user: UserProfile, data: Partial<UserProfile>): UserProfile {
  return {
    ...user,
    ...data,
    updatedAt: new Date(),
  };
}

export function formatUserProfile(user: UserProfile): string {
  return `
    Name: ${formatFullName(user)}
    Email: ${formatEmail(user.email)}
    Member since: ${user.createdAt.toLocaleDateString()}
  `;
}