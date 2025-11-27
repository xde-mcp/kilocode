// npx vitest core/mentions/__tests__/processKiloUserContentMentions.spec.ts

import { processKiloUserContentMentions } from "../processKiloUserContentMentions"
import { parseMentions } from "../index"
import { UrlContentFetcher } from "../../../services/browser/UrlContentFetcher"
import { FileContextTracker } from "../../context-tracking/FileContextTracker"
import { refreshWorkflowToggles } from "../../context/instructions/workflows"
import { parseKiloSlashCommands } from "../../slash-commands/kilo"
import * as vscode from "vscode"

// Mock dependencies
vi.mock("../index", () => ({
	parseMentions: vi.fn(),
}))

vi.mock("../../context/instructions/workflows", () => ({
	refreshWorkflowToggles: vi.fn(),
}))

vi.mock("../../slash-commands/kilo", () => ({
	parseKiloSlashCommands: vi.fn(),
}))

vi.mock("../../context/instructions/kilo-rules", () => ({
	ensureLocalKilorulesDirExists: vi.fn(),
}))

describe("processKiloUserContentMentions", () => {
	let mockContext: vscode.ExtensionContext
	let mockUrlContentFetcher: UrlContentFetcher
	let mockFileContextTracker: FileContextTracker
	let mockRooIgnoreController: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockContext = {} as vscode.ExtensionContext
		mockUrlContentFetcher = {} as UrlContentFetcher
		mockFileContextTracker = {} as FileContextTracker
		mockRooIgnoreController = {}

		// Default mock implementations
		vi.mocked(parseMentions).mockImplementation(async (text) => text)
		vi.mocked(refreshWorkflowToggles).mockResolvedValue({
			localWorkflowToggles: {},
			globalWorkflowToggles: {},
		})
		vi.mocked(parseKiloSlashCommands).mockImplementation(async (text) => ({
			processedText: text,
			needsRulesFileCheck: false,
		}))
	})

	describe("shouldProcessMentions regex optimization", () => {
		it("should process text blocks with <task> tag", async () => {
			const userContent = [
				{
					type: "text" as const,
					text: "<task>Do something</task>",
				},
			]

			await processKiloUserContentMentions({
				context: mockContext,
				userContent,
				cwd: "/test",
				urlContentFetcher: mockUrlContentFetcher,
				fileContextTracker: mockFileContextTracker,
				rooIgnoreController: mockRooIgnoreController,
				showRooIgnoredFiles: false,
			})

			expect(parseMentions).toHaveBeenCalled()
		})

		it("should process text blocks with <feedback> tag", async () => {
			const userContent = [
				{
					type: "text" as const,
					text: "<feedback>Fix this issue</feedback>",
				},
			]

			await processKiloUserContentMentions({
				context: mockContext,
				userContent,
				cwd: "/test",
				urlContentFetcher: mockUrlContentFetcher,
				fileContextTracker: mockFileContextTracker,
				rooIgnoreController: mockRooIgnoreController,
				showRooIgnoredFiles: false,
			})

			expect(parseMentions).toHaveBeenCalled()
		})

		it("should process text blocks with <answer> tag", async () => {
			const userContent = [
				{
					type: "text" as const,
					text: "<answer>User response</answer>",
				},
			]

			await processKiloUserContentMentions({
				context: mockContext,
				userContent,
				cwd: "/test",
				urlContentFetcher: mockUrlContentFetcher,
				fileContextTracker: mockFileContextTracker,
				rooIgnoreController: mockRooIgnoreController,
				showRooIgnoredFiles: false,
			})

			expect(parseMentions).toHaveBeenCalled()
		})

		it("should process text blocks with <user_message> tag", async () => {
			const userContent = [
				{
					type: "text" as const,
					text: "<user_message>User input</user_message>",
				},
			]

			await processKiloUserContentMentions({
				context: mockContext,
				userContent,
				cwd: "/test",
				urlContentFetcher: mockUrlContentFetcher,
				fileContextTracker: mockFileContextTracker,
				rooIgnoreController: mockRooIgnoreController,
				showRooIgnoredFiles: false,
			})

			expect(parseMentions).toHaveBeenCalled()
		})

		it("should NOT process text blocks without special tags", async () => {
			const userContent = [
				{
					type: "text" as const,
					text: "Regular text without special tags",
				},
			]

			await processKiloUserContentMentions({
				context: mockContext,
				userContent,
				cwd: "/test",
				urlContentFetcher: mockUrlContentFetcher,
				fileContextTracker: mockFileContextTracker,
				rooIgnoreController: mockRooIgnoreController,
				showRooIgnoredFiles: false,
			})

			expect(parseMentions).not.toHaveBeenCalled()
		})

		it("should NOT process text with partial or malformed tags", async () => {
			const userContent = [
				{
					type: "text" as const,
					text: "This has task but not <task tag properly",
				},
			]

			await processKiloUserContentMentions({
				context: mockContext,
				userContent,
				cwd: "/test",
				urlContentFetcher: mockUrlContentFetcher,
				fileContextTracker: mockFileContextTracker,
				rooIgnoreController: mockRooIgnoreController,
				showRooIgnoredFiles: false,
			})

			expect(parseMentions).not.toHaveBeenCalled()
		})

		it("should process tool_result blocks with string content containing tags", async () => {
			const userContent = [
				{
					type: "tool_result" as const,
					tool_use_id: "123",
					content: "<feedback>Tool feedback</feedback>",
				},
			]

			await processKiloUserContentMentions({
				context: mockContext,
				userContent,
				cwd: "/test",
				urlContentFetcher: mockUrlContentFetcher,
				fileContextTracker: mockFileContextTracker,
				rooIgnoreController: mockRooIgnoreController,
				showRooIgnoredFiles: false,
			})

			expect(parseMentions).toHaveBeenCalled()
		})

		it("should process tool_result blocks with array content containing tags", async () => {
			const userContent = [
				{
					type: "tool_result" as const,
					tool_use_id: "123",
					content: [
						{
							type: "text" as const,
							text: "<answer>Array answer</answer>",
						},
						{
							type: "text" as const,
							text: "Regular text",
						},
					],
				},
			]

			await processKiloUserContentMentions({
				context: mockContext,
				userContent,
				cwd: "/test",
				urlContentFetcher: mockUrlContentFetcher,
				fileContextTracker: mockFileContextTracker,
				rooIgnoreController: mockRooIgnoreController,
				showRooIgnoredFiles: false,
			})

			// Only the first text block with the tag should trigger parseMentions
			expect(parseMentions).toHaveBeenCalledTimes(1)
		})
	})
})
