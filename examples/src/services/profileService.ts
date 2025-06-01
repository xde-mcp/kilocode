// This file will contain user profile related services
// This will be moved to validation.ts in test case 2
export function getUserData(userId: string): Promise<UserData> {
	// Mock implementation
	return Promise.resolve(createDefaultUser(`user-${userId}@example.com`))
}

export { getUserData };
