import { getKiloBaseUriFromToken } from "@roo-code/types"
import { ProviderSettingsManager } from "../../../core/config/ProviderSettingsManager"

/**
 * Check if the Kilocode account has a positive balance
 * @param kilocodeToken - The Kilocode JWT token
 * @param kilocodeOrganizationId - Optional organization ID to include in headers
 * @returns Promise<boolean> - True if balance > 0, false otherwise
 */
export async function checkKilocodeBalance(kilocodeToken: string, kilocodeOrganizationId?: string): Promise<boolean> {
	try {
		const baseUrl = getKiloBaseUriFromToken(kilocodeToken)

		const headers: Record<string, string> = {
			Authorization: `Bearer ${kilocodeToken}`,
		}

		if (kilocodeOrganizationId) {
			headers["X-KiloCode-OrganizationId"] = kilocodeOrganizationId
		}

		const response = await fetch(`${baseUrl}/api/profile/balance`, {
			headers,
		})

		if (!response.ok) {
			return false
		}

		const data = await response.json()
		const balance = data.balance ?? 0
		return balance > 0
	} catch (error) {
		console.error("Error checking kilocode balance:", error)
		return false
	}
}

export const AUTOCOMPLETE_PROVIDER_MODELS = {
	mistral: "codestral-latest",
	kilocode: "mistralai/codestral-2508",
	openrouter: "mistralai/codestral-2508",
	bedrock: "mistral.codestral-2508-v1:0",
} as const
export type AutocompleteProviderKey = keyof typeof AUTOCOMPLETE_PROVIDER_MODELS

export const defaultProviderUsabilityChecker = async (
	provider: AutocompleteProviderKey,
	providerSettingsManager: ProviderSettingsManager,
): Promise<boolean> => {
	if (provider === "kilocode") {
		try {
			const profiles = await providerSettingsManager.listConfig()
			const kilocodeProfile = profiles.find((p) => p.apiProvider === "kilocode")

			if (!kilocodeProfile) {
				return false
			}

			const profile = await providerSettingsManager.getProfile({ id: kilocodeProfile.id })
			const kilocodeToken = profile.kilocodeToken
			const kilocodeOrgId = profile.kilocodeOrganizationId

			if (!kilocodeToken) {
				return false
			}

			return await checkKilocodeBalance(kilocodeToken, kilocodeOrgId)
		} catch (error) {
			console.error("Error checking kilocode balance:", error)
			return false
		}
	}

	// For all other providers, assume they are usable
	return true
}
