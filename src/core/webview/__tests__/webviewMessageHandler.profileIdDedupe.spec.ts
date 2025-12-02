// npx vitest src/core/webview/__tests__/webviewMessageHandler.profileIdDedupe.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		createTextEditorDecorationType: vi.fn(() => ({
			dispose: vi.fn(),
		})),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn(),
			update: vi.fn(),
		}),
	},
	Uri: {
		file: vi.fn((p: string) => ({ fsPath: p })),
		parse: vi.fn((p: string) => ({ fsPath: p })),
	},
	env: {
		uriScheme: "vscode",
		openExternal: vi.fn(),
	},
	commands: {
		executeCommand: vi.fn(),
	},
}))

vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		hasInstance: () => true,
		// webviewDidLaunch uses TelemetryService.instance.* directly
		instance: {
			updateTelemetryState: vi.fn(),
			updateIdentity: vi.fn().mockResolvedValue(undefined),
			captureException: vi.fn(),
			captureModeSettingChanged: vi.fn(),
			captureTabShown: vi.fn(),
			captureCustomModeCreated: vi.fn(),
			captureTelemetrySettingsChanged: vi.fn(),
			captureEvent: vi.fn(),
		},
	},
}))

vi.mock("../../integrations/theme/getTheme", () => ({
	getTheme: vi.fn().mockResolvedValue({}),
}))

vi.mock("../kiloWebviewMessgeHandlerHelpers", () => ({
	fetchAndRefreshOrganizationModesOnStartup: vi.fn().mockResolvedValue(undefined),
	refreshOrganizationModes: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../context/instructions/workflows", () => ({
	refreshWorkflowToggles: vi.fn().mockResolvedValue(undefined),
}))

import { webviewMessageHandler } from "../webviewMessageHandler"
import type { ClineProvider } from "../ClineProvider"

describe("webviewMessageHandler - profile id dedupe & reference repair", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should replicate pinnedApiConfigs for deduped ids and clear invalid id references on webviewDidLaunch", async () => {
		const state: Record<string, any> = {
			// The broken state we're repairing:
			pinnedApiConfigs: { "dup-id": true, nope: true },
			modeApiConfigs: { code: "missing-id" },
			enhancementApiConfigId: "missing-id-2",
			condensingApiConfigId: undefined,
			yoloGatekeeperApiConfigId: undefined,
			commitMessageApiConfigId: undefined,
			terminalCommandApiConfigId: undefined,
			currentApiConfigName: "first",
		}

		const getValue = vi.fn((key: string) => state[key])
		const setValue = vi.fn(async (key: string, value: any) => {
			state[key] = value
		})

		const providerSettingsManager = {
			initialize: vi.fn().mockResolvedValue(undefined),
			listConfig: vi.fn().mockResolvedValue([
				{ name: "first", id: "dup-id", apiProvider: "anthropic" },
				{ name: "second", id: "new-id", apiProvider: "anthropic" },
			]),
			hasConfig: vi.fn().mockResolvedValue(true),
			saveConfig: vi.fn(),
			consumeDuplicateIdRepairReport: vi.fn().mockReturnValue({ "dup-id": ["new-id"] }),
		}

		const provider = {
			customModesManager: {
				getCustomModes: vi.fn().mockResolvedValue([]),
			},
			contextProxy: {
				getValue,
				setValue,
				globalStorageUri: { fsPath: "/mock/storage" },
			},
			// Some startup helpers (workflows refresh) construct a ContextProxy from provider.context,
			// so we need a minimal ExtensionContext-like shape here.
			context: {
				globalState: {
					get: vi.fn(),
					update: vi.fn().mockResolvedValue(undefined),
					keys: vi.fn().mockReturnValue([]),
				},
				workspaceState: {
					get: vi.fn().mockResolvedValue(undefined),
					update: vi.fn().mockResolvedValue(undefined),
					keys: vi.fn().mockReturnValue([]),
				},
				secrets: {
					get: vi.fn(),
					store: vi.fn().mockResolvedValue(undefined),
					delete: vi.fn().mockResolvedValue(undefined),
				},
			},
			cwd: "/mock/workspace",
			getCurrentTask: vi.fn().mockReturnValue(undefined),
			getMcpHub: vi.fn().mockReturnValue(undefined),
			getStateToPostToWebview: vi.fn().mockResolvedValue({
				telemetrySetting: "disabled",
				apiConfiguration: {},
			}),
			postStateToWebview: vi.fn(),
			postRulesDataToWebview: vi.fn(),
			postMessageToWebview: vi.fn(),
			workspaceTracker: undefined,
			providerSettingsManager,
			log: vi.fn(),
			isViewLaunched: false,
		} as unknown as ClineProvider

		await webviewMessageHandler(provider, { type: "webviewDidLaunch" })

		// The list fetching / state-updating happens inside an async IIFE that isn't awaited.
		// Let microtasks resolve.
		await new Promise((r) => setTimeout(r, 0))
		await new Promise((r) => setTimeout(r, 0))

		// Ensure initialization happened (dedupe is part of ProviderSettingsManager.initialize()).
		expect(providerSettingsManager.initialize).toHaveBeenCalled()

		// pinnedApiConfigs should keep dup-id, drop invalid "nope", and add the new id from the repair report.
		expect(setValue).toHaveBeenCalledWith("pinnedApiConfigs", { "dup-id": true, "new-id": true })
		expect(state.pinnedApiConfigs).toEqual({ "dup-id": true, "new-id": true })

		// Invalid single-id references should be cleared (set to undefined).
		expect(setValue).toHaveBeenCalledWith("enhancementApiConfigId", undefined)
		expect(state.enhancementApiConfigId).toBeUndefined()

		// modeApiConfigs should be repaired to a valid id (first profile id).
		expect(setValue).toHaveBeenCalledWith("modeApiConfigs", { code: "dup-id" })
		expect(state.modeApiConfigs).toEqual({ code: "dup-id" })

		// listApiConfigMeta should be refreshed from the backend list.
		expect(setValue).toHaveBeenCalledWith("listApiConfigMeta", [
			{ name: "first", id: "dup-id", apiProvider: "anthropic" },
			{ name: "second", id: "new-id", apiProvider: "anthropic" },
		])
	})
})
