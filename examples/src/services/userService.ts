import { UserData, createDefaultUser } from "../models/User"
import { formatUserDisplayName, formatEmail } from "../utils/formatting"

// This will be moved to validation.ts in test case 2

export function updateUserProfile(user: UserData, data: Partial<UserData>): UserData {
	return {
		...user,
		...data,
		updatedAt: new Date(),
	}
}

export function formatUserProfile(user: UserData): string {
	return `
    Name: ${formatUserDisplayName(user)}
    Email: ${formatEmail(user.email)}
    Member since: ${user.createdAt.toLocaleDateString()}
  `
}