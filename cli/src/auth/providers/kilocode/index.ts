import type { AuthProvider } from "../../types.js"
import { authenticateWithDeviceAuth } from "./device-auth.js"
import { authenticateWithToken } from "./token-auth.js"

/**
 * Kilocode provider with device authorization (recommended)
 */
export const kilocodeDeviceAuthProvider: AuthProvider = {
	name: "Kilo Code",
	value: "kilocode-device",
	authenticate: authenticateWithDeviceAuth,
}

/**
 * Kilocode provider with manual token entry (advanced)
 */
export const kilocodeTokenAuthProvider: AuthProvider = {
	name: "Kilo Code (Manual)",
	value: "kilocode-token",
	authenticate: authenticateWithToken,
}
