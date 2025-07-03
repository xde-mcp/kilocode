import { type Page, type FrameLocator, expect } from "@playwright/test"
import type { WebviewMessage } from "../../../src/shared/WebviewMessage"
import { ProviderSettings } from "../../../packages/types/dist/index.cjs"

const defaultPlaywrightApiConfig = {
	apiProvider: "openrouter" as const,
	openRouterApiKey: process.env.OPENROUTER_API_KEY,
	openRouterModelId: "openai/gpt-4o-mini",
}

export async function findWebview(workbox: Page): Promise<FrameLocator> {
	const webviewFrameEl = workbox.frameLocator(
		'iframe[src*="extensionId=kilocode.kilo-code"][src*="purpose=webviewView"]',
	)
	await webviewFrameEl.locator("#active-frame")
	return webviewFrameEl.frameLocator("#active-frame")
}

export async function waitForWebviewText(page: Page, text: string, timeout: number = 10000): Promise<void> {
	const webviewFrame = await findWebview(page)
	await expect(webviewFrame.locator("body")).toContainText(text, { timeout })
}

export async function postWebviewMessage(page: Page, message: WebviewMessage): Promise<void> {
	const webviewFrame = await findWebview(page)
	await webviewFrame.locator("body").evaluate((element, msg) => {
		if (!window.vscode) {
			throw new Error("Global vscode API not found")
		}

		window.vscode.postMessage(msg)
	}, message)
}

export async function verifyExtensionInstalled(page: Page) {
	try {
		const activityBarIcon = page.locator('[aria-label*="Kilo"], [title*="Kilo"]').first()
		expect(await activityBarIcon).toBeDefined()
	} catch (_error) {
		throw new Error("Failed to find the installed extension! Check if the build failed and try again.")
	}
}

export async function upsertApiConfiguration(page: Page, apiConfiguration?: Partial<ProviderSettings>): Promise<void> {
	await postWebviewMessage(page, {
		type: "upsertApiConfiguration",
		text: "default",
		apiConfiguration: apiConfiguration ?? defaultPlaywrightApiConfig,
	})
	await postWebviewMessage(page, { type: "currentApiConfigName", text: "default" })
}

export async function configureApiKeyThroughUI(page: Page): Promise<void> {
	const webviewFrame = await findWebview(page)

	// Click "Use your own API key" button
	const useOwnKeyButton = webviewFrame.locator('button:has-text("Use your own API key")')
	await useOwnKeyButton.waitFor()
	await useOwnKeyButton.click()

	// Wait for the provider selection dropdown to appear
	const providerDropdown = webviewFrame.locator('[role="combobox"]').first()
	await providerDropdown.waitFor()
	await providerDropdown.click()

	// Select OpenRouter from the dropdown
	const openRouterOption = webviewFrame.locator('[role="option"]:has-text("OpenRouter")')
	await openRouterOption.waitFor()
	await openRouterOption.click()

	// Fill in the OpenRouter API key (password field)
	const apiKeyInput = webviewFrame.locator('input[type="password"]').first()
	await apiKeyInput.waitFor()
	await apiKeyInput.fill(process.env.OPENROUTER_API_KEY || "")

	// Submit the configuration by clicking "Let's go!" button
	const submitButton = webviewFrame.locator('button:has-text("Let\'s go!")')
	await submitButton.waitFor()

	await submitButton.click()
}
