import { UserProfile } from "../models/User";
// This file will contain user profile service functions
export function getUserData(userId: string): Promise<UserProfile> {
  // Mock implementation
  return Promise.resolve(createDefaultUser(`user-${userId}@example.com`));
}
