import { User, createDefaultUser } from "../models/User";
import { formatFullName, formatEmail } from "../utils/formatting";

// This will be moved to validation.ts in test case 2

export function getUserData(userId: string): Promise<User> {
  // Mock implementation
  return Promise.resolve(createDefaultUser(`user-${userId}@example.com`));
}

export function updateUserProfile(user: User, data: Partial<User>): User {
  return {
    ...user,
    ...data,
    updatedAt: new Date(),
  };
}

export function formatUserProfile(user: User): string {
  return `
    Name: ${formatFullName(user)}
    Email: ${formatEmail(user.email)}
    Member since: ${user.createdAt.toLocaleDateString()}
  `;
}