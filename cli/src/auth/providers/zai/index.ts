import type { AuthProvider } from "../../types.js"
import { authenticateWithZaiApiKey } from "./api-key-auth.js"

/**
 * zAI provider with API key authentication
 */
export const zaiProvider: AuthProvider = {
	name: "zAI",
	value: "zai",
	authenticate: authenticateWithZaiApiKey,
}
