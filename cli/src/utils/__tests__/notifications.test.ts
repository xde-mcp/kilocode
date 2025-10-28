import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import axios from "axios"
import { fetchKilocodeNotifications, supportsNotifications } from "../notifications.js"
import type { ProviderConfig } from "../../config/types.js"
import type { KilocodeNotification } from "../../state/atoms/notifications.js"

// Mock axios
vi.mock("axios")
const mockedAxios = vi.mocked(axios)

// Mock @roo-code/types
vi.mock("@roo-code/types", () => ({
	getKiloUrlFromToken: (url: string, token?: string) => {
		// Simple mock that returns the URL as-is for production tokens
		// or maps to localhost for dev tokens
		if (token?.includes("dev")) {
			return url.replace("https://api.kilocode.ai", "http://localhost:3000")
		}
		return url
	},
}))

// Mock logs
vi.mock("../../services/logs.js", () => ({
	logs: {
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	},
}))

describe("fetchKilocodeNotifications", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should return empty array for non-kilocode provider", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "openai-native",
			apiKey: "test-key",
		}

		const result = await fetchKilocodeNotifications(provider)

		expect(result).toEqual([])
		expect(mockedAxios.get).not.toHaveBeenCalled()
	})

	it("should return empty array when kilocode token is missing", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
		}

		const result = await fetchKilocodeNotifications(provider)

		expect(result).toEqual([])
		expect(mockedAxios.get).not.toHaveBeenCalled()
	})

	it("should fetch notifications successfully for kilocode provider", async () => {
		const mockNotifications: KilocodeNotification[] = [
			{
				id: "notif-1",
				title: "Test Notification",
				message: "This is a test notification",
			},
			{
				id: "notif-2",
				title: "Another Notification",
				message: "This is another test notification",
				action: {
					actionText: "Learn More",
					actionURL: "https://example.com",
				},
			},
		]

		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
		}

		mockedAxios.get.mockResolvedValueOnce({
			data: {
				notifications: mockNotifications,
			},
		})

		const result = await fetchKilocodeNotifications(provider)

		expect(result).toEqual(mockNotifications)
		expect(mockedAxios.get).toHaveBeenCalledWith(
			"https://api.kilocode.ai/api/users/notifications",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
				}),
				timeout: 5000,
			}),
		)
	})

	it("should include X-KILOCODE-TESTER header when tester warnings are disabled", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
			kilocodeTesterWarningsDisabledUntil: Date.now() + 10000, // 10 seconds in the future
		}

		mockedAxios.get.mockResolvedValueOnce({
			data: {
				notifications: [],
			},
		})

		await fetchKilocodeNotifications(provider)

		expect(mockedAxios.get).toHaveBeenCalledWith(
			"https://api.kilocode.ai/api/users/notifications",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
					"X-KILOCODE-TESTER": "SUPPRESS",
				}),
				timeout: 5000,
			}),
		)
	})

	it("should not include X-KILOCODE-TESTER header when tester warnings are expired", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
			kilocodeTesterWarningsDisabledUntil: Date.now() - 10000, // 10 seconds in the past
		}

		mockedAxios.get.mockResolvedValueOnce({
			data: {
				notifications: [],
			},
		})

		await fetchKilocodeNotifications(provider)

		expect(mockedAxios.get).toHaveBeenCalledWith(
			"https://api.kilocode.ai/api/users/notifications",
			expect.objectContaining({
				headers: expect.not.objectContaining({
					"X-KILOCODE-TESTER": "SUPPRESS",
				}),
			}),
		)
	})

	it("should return empty array when API returns no notifications", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
		}

		mockedAxios.get.mockResolvedValueOnce({
			data: {
				notifications: [],
			},
		})

		const result = await fetchKilocodeNotifications(provider)

		expect(result).toEqual([])
	})

	it("should return empty array when API returns undefined notifications", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
		}

		mockedAxios.get.mockResolvedValueOnce({
			data: {},
		})

		const result = await fetchKilocodeNotifications(provider)

		expect(result).toEqual([])
	})

	it("should return empty array and log error on API failure", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
		}

		const error = new Error("Network error")
		mockedAxios.get.mockRejectedValueOnce(error)

		const result = await fetchKilocodeNotifications(provider)

		expect(result).toEqual([])
	})

	it("should return empty array on timeout", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
		}

		const error = new Error("timeout of 5000ms exceeded")
		mockedAxios.get.mockRejectedValueOnce(error)

		const result = await fetchKilocodeNotifications(provider)

		expect(result).toEqual([])
	})

	it("should handle API error with status code", async () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
		}

		const error = {
			message: "Request failed with status code 401",
			response: {
				status: 401,
			},
		}
		mockedAxios.get.mockRejectedValueOnce(error)

		const result = await fetchKilocodeNotifications(provider)

		expect(result).toEqual([])
	})
})

describe("supportsNotifications", () => {
	it("should return true for kilocode provider with token", () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
			kilocodeToken: "test-token",
		}

		expect(supportsNotifications(provider)).toBe(true)
	})

	it("should return false for kilocode provider without token", () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "kilocode",
		}

		expect(supportsNotifications(provider)).toBe(false)
	})

	it("should return false for non-kilocode provider", () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "openai-native",
			apiKey: "test-key",
		}

		expect(supportsNotifications(provider)).toBe(false)
	})

	it("should return false for non-kilocode provider even with kilocodeToken field", () => {
		const provider: ProviderConfig = {
			id: "test-provider",
			provider: "openai-native",
			kilocodeToken: "test-token",
		}

		expect(supportsNotifications(provider)).toBe(false)
	})
})
