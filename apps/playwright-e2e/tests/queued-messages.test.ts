import { test } from "./playwright-base-test"
import {
	verifyExtensionInstalled,
	upsertApiConfiguration,
	waitForWebviewText,
	findWebview,
} from "../helpers/webview-helpers"

test.describe("Queued Messages Feature", () => {
	test.beforeEach(async ({ workbox: page }) => {
		await verifyExtensionInstalled(page)
		await waitForWebviewText(page, "Welcome to Kilo Code!")
		await upsertApiConfiguration(page)
		await waitForWebviewText(page, "Generate, refactor, and debug code with AI assistance")
	})

	test.describe("Core Functionality", () => {
		test("should queue message and display indicator when agent is processing", async ({ workbox: page }) => {
			const webviewFrame = await findWebview(page)
			const chatInput = webviewFrame.locator('textarea, input[type="text"]').first()
			await chatInput.waitFor({ timeout: 5000 })

			// Send first message to make agent busy
			await chatInput.fill("Calculate 1+1 and explain your reasoning")
			await chatInput.press("Enter")

			// Wait a brief moment for React to update sendingDisabled state
			await page.waitForTimeout(100)

			// Send second message while first is still processing (should be queued)
			await chatInput.fill("What is 2+2?")
			await chatInput.press("Enter")

			// Check that queued indicator appears with correct text
			const queuedIndicator = webviewFrame.locator('[data-testid="queued-indicator"]')
			await queuedIndicator.waitFor({ state: "visible", timeout: 5000 })
			await test.expect(queuedIndicator).toContainText("queued")

			// Verify the chat input is cleared after queuing
			const inputValue = await chatInput.inputValue()
			test.expect(inputValue).toBe("")
		})

		test("should auto-submit queued message when agent finishes", async ({ workbox: page }) => {
			const webviewFrame = await findWebview(page)
			const chatInput = webviewFrame.locator('textarea, input[type="text"]').first()
			await chatInput.waitFor({ timeout: 5000 })

			// Send first message
			await chatInput.fill("Output only the result: 1+1")
			await chatInput.press("Enter")

			// Wait a brief moment for React to update sendingDisabled state
			await page.waitForTimeout(100)

			// Queue second message
			await chatInput.fill("Output only the result: 2+2")
			await chatInput.press("Enter")

			// Verify queued indicator appears
			const queuedIndicator = webviewFrame.locator('[data-testid="queued-indicator"]')
			await queuedIndicator.waitFor({ state: "visible", timeout: 5000 })

			// Wait for first response to complete and queued message to auto-submit
			await waitForWebviewText(page, "2", 30_000) // First response

			// Wait for queued indicator to disappear (auto-submit happened)
			await queuedIndicator.waitFor({ state: "hidden", timeout: 10_000 })

			// Wait for second response to appear
			await waitForWebviewText(page, "4", 30_000) // Second response
		})
	})

	test.describe("Edge Cases", () => {
		test("should handle queue replacement with multiple messages", async ({ workbox: page }) => {
			const webviewFrame = await findWebview(page)
			const chatInput = webviewFrame.locator('textarea, input[type="text"]').first()
			await chatInput.waitFor({ timeout: 5000 })

			// Send first message to make agent busy
			await chatInput.fill("Output only: hello")
			await chatInput.press("Enter")

			// Wait a brief moment for React to update sendingDisabled state
			await page.waitForTimeout(100)

			// Rapidly send multiple messages (should replace each other)
			await chatInput.fill("What is 2+2?")
			await chatInput.press("Enter")

			await chatInput.fill("What is 3+3?")
			await chatInput.press("Enter")

			await chatInput.fill("What is 5+5?")
			await chatInput.press("Enter")

			// Should only show one queued indicator
			const queuedIndicators = webviewFrame.locator('[data-testid="queued-indicator"]')
			await test.expect(queuedIndicators).toHaveCount(1)

			// Wait for first response and auto-submit of final queued message
			await waitForWebviewText(page, "hello", 30_000) // First response

			// Wait for auto-submit to happen
			const queuedIndicator = queuedIndicators.first()
			await queuedIndicator.waitFor({ state: "hidden", timeout: 15_000 })

			// Should process the FINAL message (5+5=10), not the earlier ones
			await waitForWebviewText(page, "10", 30_000)
		})

		test("should not queue when agent is already idle", async ({ workbox: page }) => {
			const webviewFrame = await findWebview(page)
			const chatInput = webviewFrame.locator('textarea, input[type="text"]').first()
			await chatInput.waitFor({ timeout: 5000 })

			// Send message when agent is idle (should send immediately)
			await chatInput.fill("Output only: test")
			await chatInput.press("Enter")

			// Queued indicator should NOT appear
			const queuedIndicator = webviewFrame.locator('[data-testid="queued-indicator"]')
			await test.expect(queuedIndicator).not.toBeVisible()

			// Should get response normally
			await waitForWebviewText(page, "test", 30_000)
		})
	})
})
