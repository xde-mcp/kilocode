import type { AuthProvider } from "../types.js"
import { kilocodeDeviceAuthProvider, kilocodeTokenAuthProvider } from "./kilocode/index.js"
import { zaiProvider } from "./zai/index.js"
import { otherProvider } from "./other/index.js"

/**
 * Registry of all available authentication providers
 * Ordered by priority (most recommended first)
 */
export const authProviders: AuthProvider[] = [
	kilocodeDeviceAuthProvider, // Recommended: Browser-based device auth
	kilocodeTokenAuthProvider, // Advanced: Manual token entry
	zaiProvider, // zAI API key
	otherProvider, // Manual configuration
]

/**
 * Get a provider by its value
 * @param value The provider value to look up
 * @returns The provider or undefined if not found
 */
export function getProviderByValue(value: string): AuthProvider | undefined {
	return authProviders.find((provider) => provider.value === value)
}
