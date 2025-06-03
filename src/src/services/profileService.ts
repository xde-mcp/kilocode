import { UserProfile } from "../../../../../../../var/folders/cw/7r3c18156k3fq3pb22p0d6840000gn/T/move-verifier-test-1D2AEq/src/models/User"
// Test target file
export function getUserData(userId: string): Promise<UserProfile> {
	// Implementation
	return Promise.resolve({
		id: userId,
		email: `user-${userId}@example.com`,
		firstName: "Test",
		lastName: "User",
		createdAt: new Date(),
		updatedAt: new Date(),
	})
}
