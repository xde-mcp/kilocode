/**
 * Interface for API configuration.
 * Implementations should provide the base API URL for making requests.
 */
export interface IApiConfig {
	/**
	 * Get the base API URL for making requests.
	 * @returns The base URL (e.g., "https://api.kilocode.com")
	 */
	getApiUrl(): string
}
