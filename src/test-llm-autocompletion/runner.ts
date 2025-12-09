#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { GhostProviderTester } from "./ghost-provider-tester.js"
import { testCases, getCategories, TestCase, ContextFile } from "./test-cases.js"
import { checkApproval } from "./approvals.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface TestResult {
	testCase: TestCase
	isApproved: boolean
	completion: string
	error?: string
	actualValue?: string
	newOutput?: boolean
	llmRequestDuration?: number
	strategyName?: string
}

export class TestRunner {
	private verbose: boolean
	private results: TestResult[] = []
	private skipApproval: boolean
	private useOpusApproval: boolean
	private originalConsoleLog: typeof console.log
	private originalConsoleInfo: typeof console.info

	constructor(verbose: boolean = false, skipApproval: boolean = false, useOpusApproval: boolean = false) {
		this.verbose = verbose
		this.skipApproval = skipApproval
		this.useOpusApproval = useOpusApproval
		this.originalConsoleLog = console.log
		this.originalConsoleInfo = console.info
	}

	private suppressConsole(): void {
		if (!this.verbose) {
			console.log = () => {}
			console.info = () => {}
		}
	}

	private restoreConsole(): void {
		console.log = this.originalConsoleLog
		console.info = this.originalConsoleInfo
	}

	async runTest(testCase: TestCase, tester: GhostProviderTester): Promise<TestResult> {
		try {
			this.suppressConsole()
			const startTime = performance.now()
			const { prefix, completion, suffix } = await tester.getCompletion(
				testCase.input,
				testCase.name,
				testCase.contextFiles,
			)
			const llmRequestDuration = performance.now() - startTime
			this.restoreConsole()
			let actualValue: string = prefix + completion + suffix

			if (completion === "") {
				actualValue = "(no changes parsed)"
			}

			// Auto-reject if no changes were parsed
			if (actualValue === "(no changes parsed)") {
				return {
					testCase,
					isApproved: false,
					completion,
					actualValue,
					llmRequestDuration,
				}
			}

			const approvalResult = await checkApproval(
				testCase.category,
				testCase.name,
				testCase.input,
				actualValue,
				completion,
				testCase.filename,
				testCase.contextFiles,
				this.skipApproval,
				this.useOpusApproval,
			)

			return {
				...approvalResult,
				testCase,
				completion,
				actualValue,
				llmRequestDuration,
			}
		} catch (error) {
			this.restoreConsole()
			return {
				testCase,
				isApproved: false,
				completion: "",
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}

	private isUnknownResult(result: TestResult): boolean {
		return !result.isApproved && result.newOutput === true && this.skipApproval
	}

	async runAllTests(numRuns: number = 1): Promise<void> {
		const tester = new GhostProviderTester()
		const model = process.env.LLM_MODEL || "mistralai/codestral-2508"
		const strategyName = tester.getName()

		console.log("\n🚀 Starting LLM Autocompletion Tests\n")
		console.log("Provider: kilocode")
		console.log("Model:", model)
		console.log("Strategy:", strategyName)
		if (numRuns > 1) {
			console.log("Runs per test:", numRuns)
		}
		if (this.skipApproval) {
			console.log("Skip Approval: enabled (tests will fail if not already approved)")
		}
		if (this.useOpusApproval) {
			console.log("Opus Auto-Approval: enabled (using Claude Opus to judge completions)")
		}
		console.log("Total tests:", testCases.length)
		console.log("Categories:", getCategories().join(", "))
		console.log("\n" + "─".repeat(80) + "\n")

		for (const category of getCategories()) {
			console.log(`\n📁 ${category}`)
			console.log("─".repeat(40))

			const categoryTests = testCases.filter((tc) => tc.category === category)

			for (const testCase of categoryTests) {
				if (numRuns > 1) {
					console.log(`  Running ${testCase.name} [${strategyName}] (${numRuns} runs)...`)
				} else {
					process.stdout.write(`  Running ${testCase.name} [${strategyName}]... `)
				}

				const runResults: TestResult[] = []
				for (let run = 0; run < numRuns; run++) {
					const result = await this.runTest(testCase, tester)
					result.strategyName = strategyName
					runResults.push(result)
					this.results.push(result)

					if (numRuns > 1) {
						const status = result.isApproved ? "✓" : this.isUnknownResult(result) ? "?" : "✗"
						process.stdout.write(`    Run ${run + 1}/${numRuns}: ${status}`)
						if (result.llmRequestDuration) {
							process.stdout.write(` (${result.llmRequestDuration.toFixed(0)}ms)`)
						}
						console.log()
					}
				}

				// For single run, show result inline; for multiple runs, show summary
				if (numRuns === 1) {
					const result = runResults[0]
					if (result.isApproved) {
						console.log("✓ PASSED")
						if (result.newOutput) {
							console.log(`    (New output approved)`)
						}
					} else if (this.isUnknownResult(result)) {
						console.log("? UNKNOWN")
						console.log(`    (New output without approval)`)
					} else {
						console.log("✗ FAILED")
						if (result.error) {
							console.log(`    Error: ${result.error}`)
						} else if (this.verbose) {
							console.log(`    Input:`)
							console.log("    " + "─".repeat(76))
							console.log(
								testCase.input
									.split("\n")
									.map((l) => "    " + l)
									.join("\n"),
							)
							console.log("    " + "─".repeat(76))
							console.log(`    Got:`)
							console.log("    " + "─".repeat(76))
							console.log(
								(result.actualValue || "")
									.split("\n")
									.map((l) => "    " + l)
									.join("\n"),
							)
							console.log("    " + "─".repeat(76))

							if (result.completion) {
								console.log("    Full LLM Response:")
								console.log(
									result.completion
										.split("\n")
										.map((l) => "      " + l)
										.join("\n"),
								)
							}
						}
					}
				} else {
					// Summary for multiple runs
					const passed = runResults.filter((r) => r.isApproved).length
					const failed = runResults.filter((r) => !r.isApproved && !this.isUnknownResult(r)).length
					const unknown = runResults.filter((r) => this.isUnknownResult(r)).length
					const passRate = ((passed / numRuns) * 100).toFixed(0)
					console.log(`    Summary: ${passed}/${numRuns} passed (${passRate}%)`)
					if (failed > 0) {
						console.log(`    Failed: ${failed}, Unknown: ${unknown}`)
					}
				}

				if (this.verbose) {
					console.log(`    Description: ${testCase.description}`)
				}
			}
		}

		tester.dispose()
		this.printSummary()
	}

	private printSummary(): void {
		console.log("\n" + "═".repeat(80))
		console.log("\n📊 Test Summary\n")

		const unknownResults = this.results.filter((r) => this.isUnknownResult(r))
		const failedResults = this.results.filter((r) => !r.isApproved && !this.isUnknownResult(r))
		const passedResults = this.results.filter((r) => r.isApproved)

		const passed = passedResults.length
		const unknown = unknownResults.length
		const failed = failedResults.length
		const knownTotal = passed + failed
		const passRate = knownTotal > 0 ? ((passed / knownTotal) * 100).toFixed(1) : "0.0"

		console.log(`  ✓ Passed: ${passed}`)
		console.log(`  ✗ Failed: ${failed}`)
		if (unknown > 0) {
			console.log(`  ? Unknown: ${unknown}`)
		}
		console.log(`  📈 Accuracy: ${passRate}% (${passed}/${knownTotal})`)

		const requestDurations = this.results
			.filter((r) => r.llmRequestDuration !== undefined)
			.map((r) => r.llmRequestDuration!)
		if (requestDurations.length > 0) {
			const avgTime = (
				requestDurations.reduce((sum, duration) => sum + duration, 0) / requestDurations.length
			).toFixed(0)
			console.log(`  ⏱️  Avg LLM Request Time: ${avgTime}ms`)
		}

		// Category breakdown
		console.log("\n📁 Category Breakdown:")
		for (const category of getCategories()) {
			const categoryResults = this.results.filter((r) => r.testCase.category === category)
			const categoryPassed = categoryResults.filter((r) => r.isApproved).length
			const categoryTotal = categoryResults.length
			const categoryRateNum = (categoryPassed / categoryTotal) * 100
			const categoryRate = categoryRateNum.toFixed(0)

			const statusIndicator = categoryRateNum === 100 ? "✓" : categoryRateNum >= 75 ? "⚠" : "✗"

			console.log(`  ${category}: ${statusIndicator} ${categoryPassed}/${categoryTotal} (${categoryRate}%)`)
		}

		// Strategy usage statistics
		const strategyUsage = new Map<string, number>()
		for (const result of this.results) {
			if (result.strategyName) {
				strategyUsage.set(result.strategyName, (strategyUsage.get(result.strategyName) || 0) + 1)
			}
		}

		if (strategyUsage.size > 0) {
			console.log("\n🎯 Strategy Usage:")
			const sortedStrategies = Array.from(strategyUsage.entries()).sort((a, b) => b[1] - a[1])
			for (const [strategyName, count] of sortedStrategies) {
				const percentage = ((count / this.results.length) * 100).toFixed(0)
				console.log(`  ${strategyName}: ${count} (${percentage}%)`)
			}
		}

		// Unknown tests details
		if (unknown > 0) {
			console.log("\n❓ Unknown Tests (new outputs without approval):")
			for (const result of unknownResults) {
				console.log(`  • ${result.testCase.name} (${result.testCase.category})`)
			}
		}

		console.log("\n" + "═".repeat(80) + "\n")

		// Exit with appropriate code
		process.exit(failed > 0 ? 1 : 0)
	}

	async runSingleTest(testName: string, numRuns: number = 10): Promise<void> {
		const tester = new GhostProviderTester()
		const testCase = testCases.find((tc) => tc.name === testName)
		if (!testCase) {
			console.error(`Test "${testName}" not found`)
			console.log("\nAvailable tests:")
			testCases.forEach((tc) => console.log(`  - ${tc.name}`))
			tester.dispose()
			process.exit(1)
		}

		console.log(`\n🧪 Running Single Test: ${testName} (${numRuns} times)\n`)
		console.log("Category:", testCase.category)
		console.log("Description:", testCase.description)
		console.log("\nInput Code:")
		console.log(testCase.input)
		console.log("\n" + "═".repeat(80))

		const results: TestResult[] = []

		for (let i = 0; i < numRuns; i++) {
			console.log(`\n🔄 Run ${i + 1}/${numRuns}...`)

			const result = await this.runTest(testCase, tester)

			results.push(result)

			const status = result.isApproved ? "✓ PASSED" : "✗ FAILED"
			const llmTime = result.llmRequestDuration ? `${result.llmRequestDuration.toFixed(0)}ms LLM` : "N/A"
			console.log(`   ${status} - ${llmTime}`)
		}

		console.log("\n" + "═".repeat(80))
		console.log("\n📊 Test Statistics\n")

		const passedRuns = results.filter((r) => r.isApproved).length
		const failedRuns = numRuns - passedRuns
		console.log(`  ✓ Passed: ${passedRuns}/${numRuns}`)
		console.log(`  ✗ Failed: ${failedRuns}/${numRuns}`)

		const llmTimes = results.filter((r) => r.llmRequestDuration !== undefined).map((r) => r.llmRequestDuration!)
		if (llmTimes.length > 0) {
			const sortedLlmTimes = [...llmTimes].sort((a, b) => a - b)
			const avgLlmTime = llmTimes.reduce((sum, time) => sum + time, 0) / llmTimes.length
			const minLlmTime = sortedLlmTimes[0]
			const maxLlmTime = sortedLlmTimes[sortedLlmTimes.length - 1]
			const medianLlmTime = sortedLlmTimes[Math.floor(llmTimes.length / 2)]

			console.log("\n⚡ LLM Request Time:")
			console.log(`  Average: ${avgLlmTime.toFixed(0)}ms`)
			console.log(`  Median:  ${medianLlmTime.toFixed(0)}ms`)
			console.log(`  Min:     ${minLlmTime.toFixed(0)}ms`)
			console.log(`  Max:     ${maxLlmTime.toFixed(0)}ms`)
		}

		const lastResult = results[results.length - 1]

		console.log("\n" + "═".repeat(80))
		console.log("\n📝 Last Run Details\n")

		if (lastResult.isApproved) {
			console.log("✓ TEST PASSED")
			if (lastResult.newOutput) {
				console.log("(New output approved)")
			}
		} else {
			console.log("✗ TEST FAILED")
			if (lastResult.error) {
				console.log(`Error: ${lastResult.error}`)
			} else {
				console.log("\nExtracted value being tested:")
				console.log(`  "${lastResult.actualValue}"`)
			}
		}

		if (this.verbose && lastResult.completion) {
			console.log("\nCompletion:")
			console.log("  " + "─".repeat(78))
			console.log(
				lastResult.completion
					.split("\n")
					.map((l) => "  " + l)
					.join("\n"),
			)
			console.log("  " + "─".repeat(78))
		}

		console.log("\n" + "═".repeat(80) + "\n")

		tester.dispose()
		process.exit(passedRuns === numRuns ? 0 : 1)
	}

	async cleanApprovals(): Promise<void> {
		console.log("\n🧹 Cleaning approvals for non-existent test cases...\n")

		// Create a set of existing test case identifiers
		const existingTestCases = new Set(testCases.map((tc) => `${tc.category}/${tc.name}`))

		const approvalsDir = "approvals"
		let cleanedCount = 0
		let totalFiles = 0

		if (!fs.existsSync(approvalsDir)) {
			console.log("No approvals directory found.")
			return
		}

		// Recursively scan approvals directory
		function scanDirectory(dirPath: string, currentCategory?: string): void {
			const items = fs.readdirSync(dirPath, { withFileTypes: true })

			for (const item of items) {
				const fullPath = path.join(dirPath, item.name)

				if (item.isDirectory()) {
					// Category directory
					scanDirectory(fullPath, item.name)
				} else if (item.isFile() && item.name.endsWith(".txt")) {
					totalFiles++

					// Parse filename: testName.approved.1.txt or testName.rejected.1.txt
					const match = item.name.match(/^(.+)\.(approved|rejected)\.\d+\.txt$/)
					if (match) {
						const testName = match[1]
						const category = currentCategory || path.basename(path.dirname(fullPath))
						const testCaseId = `${category}/${testName}`

						if (!existingTestCases.has(testCaseId)) {
							console.log(`Removing approval for non-existent test case: ${testCaseId}`)
							fs.unlinkSync(fullPath)
							cleanedCount++
						}
					}
				}
			}
		}

		scanDirectory(approvalsDir)

		console.log(`\n✅ Cleaned ${cleanedCount} approval files out of ${totalFiles} total files.`)
		if (cleanedCount > 0) {
			console.log("Removed approvals for test cases that no longer exist.")
		} else {
			console.log("No orphaned approval files found.")
		}
	}
}

// Standalone report generation function
async function generateHtmlReport() {
	const OUTPUT_DIR = path.join(__dirname, "html-output")
	const APPROVALS_DIR = path.join(__dirname, "approvals")
	const CURSOR_MARKER = "<<<AUTOCOMPLETE_HERE>>>"

	interface ApprovalFile {
		filename: string
		type: "approved" | "rejected"
		number: number
		content: string
	}

	interface TestCaseWithApprovals extends TestCase {
		approvals: ApprovalFile[]
	}

	function loadApprovals(category: string, testName: string): ApprovalFile[] {
		const categoryDir = path.join(APPROVALS_DIR, category)
		if (!fs.existsSync(categoryDir)) {
			return []
		}

		const approvals: ApprovalFile[] = []
		const pattern = new RegExp(`^${testName}\\.(approved|rejected)\\.(\\d+)\\.txt$`)
		const files = fs.readdirSync(categoryDir).filter((f) => pattern.test(f))

		for (const file of files) {
			const match = file.match(pattern)
			if (match) {
				const filePath = path.join(categoryDir, file)
				const content = fs.readFileSync(filePath, "utf-8")
				approvals.push({
					filename: file,
					type: match[1] as "approved" | "rejected",
					number: parseInt(match[2], 10),
					content,
				})
			}
		}

		approvals.sort((a, b) => a.number - b.number)
		return approvals
	}

	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;")
	}

	function highlightCursor(text: string): string {
		const escaped = escapeHtml(text)
		return escaped.replace(escapeHtml(CURSOR_MARKER), '<span class="cursor-marker">⟨CURSOR⟩</span>')
	}

	function generateIndexHtml(testCasesWithApprovals: TestCaseWithApprovals[]): string {
		const byCategory = new Map<string, TestCaseWithApprovals[]>()
		for (const tc of testCasesWithApprovals) {
			if (!byCategory.has(tc.category)) {
				byCategory.set(tc.category, [])
			}
			byCategory.get(tc.category)!.push(tc)
		}

		let categoriesHtml = ""
		for (const [category, cases] of byCategory) {
			let casesHtml = ""
			for (const tc of cases) {
				const approvedCount = tc.approvals.filter((a) => a.type === "approved").length
				const rejectedCount = tc.approvals.filter((a) => a.type === "rejected").length
				const statusClass =
					approvedCount > 0 && rejectedCount === 0
						? "all-approved"
						: approvedCount === 0 && rejectedCount > 0
							? "all-rejected"
							: "mixed"

				casesHtml += `
				<div class="test-case-item ${statusClass}">
					<a href="${category}/${tc.name}.html">${tc.name}</a>
					<span class="counts">
						<span class="approved-count" title="Approved">✓ ${approvedCount}</span>
						<span class="rejected-count" title="Rejected">✗ ${rejectedCount}</span>
					</span>
				</div>
			`
			}

			categoriesHtml += `
			<div class="category">
				<h2>${category}</h2>
				<div class="test-cases-list">
					${casesHtml}
				</div>
			</div>
		`
		}

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>LLM Autocompletion Test Cases</title>
	<style>
		* { box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			margin: 0;
			padding: 20px;
			background: #1e1e1e;
			color: #d4d4d4;
		}
		h1 {
			color: #569cd6;
			border-bottom: 2px solid #569cd6;
			padding-bottom: 10px;
		}
		h2 {
			color: #4ec9b0;
			margin-top: 30px;
		}
		.category {
			margin-bottom: 30px;
		}
		.test-cases-list {
			display: flex;
			flex-wrap: wrap;
			gap: 10px;
		}
		.test-case-item {
			background: #2d2d2d;
			padding: 10px 15px;
			border-radius: 5px;
			display: flex;
			align-items: center;
			gap: 15px;
			border-left: 4px solid #666;
		}
		.test-case-item.all-approved { border-left-color: #4caf50; }
		.test-case-item.all-rejected { border-left-color: #f44336; }
		.test-case-item.mixed { border-left-color: #ff9800; }
		.test-case-item a {
			color: #9cdcfe;
			text-decoration: none;
		}
		.test-case-item a:hover {
			text-decoration: underline;
		}
		.counts {
			display: flex;
			gap: 10px;
			font-size: 0.85em;
		}
		.approved-count { color: #4caf50; }
		.rejected-count { color: #f44336; }
		.summary {
			background: #2d2d2d;
			padding: 15px 20px;
			border-radius: 5px;
			margin-bottom: 20px;
		}
		.summary-stats {
			display: flex;
			gap: 30px;
		}
		.stat {
			display: flex;
			flex-direction: column;
		}
		.stat-value {
			font-size: 2em;
			font-weight: bold;
		}
		.stat-label {
			color: #888;
		}
	</style>
</head>
<body>
	<h1>LLM Autocompletion Test Cases</h1>
	
	<div class="summary">
		<div class="summary-stats">
			<div class="stat">
				<span class="stat-value">${testCasesWithApprovals.length}</span>
				<span class="stat-label">Test Cases</span>
			</div>
			<div class="stat">
				<span class="stat-value approved-count">${testCasesWithApprovals.reduce((sum, tc) => sum + tc.approvals.filter((a) => a.type === "approved").length, 0)}</span>
				<span class="stat-label">Approved Outputs</span>
			</div>
			<div class="stat">
				<span class="stat-value rejected-count">${testCasesWithApprovals.reduce((sum, tc) => sum + tc.approvals.filter((a) => a.type === "rejected").length, 0)}</span>
				<span class="stat-label">Rejected Outputs</span>
			</div>
		</div>
	</div>

	${categoriesHtml}
</body>
</html>`
	}

	function generateTestCaseHtml(tc: TestCaseWithApprovals, allTestCases: TestCaseWithApprovals[]): string {
		const sameCategoryTests = allTestCases.filter((t) => t.category === tc.category)
		const currentIndex = sameCategoryTests.findIndex((t) => t.name === tc.name)
		const prevTest = currentIndex > 0 ? sameCategoryTests[currentIndex - 1] : null
		const nextTest = currentIndex < sameCategoryTests.length - 1 ? sameCategoryTests[currentIndex + 1] : null

		const approvedOutputs = tc.approvals.filter((a) => a.type === "approved")
		const rejectedOutputs = tc.approvals.filter((a) => a.type === "rejected")

		let approvalsHtml = ""

		if (approvedOutputs.length > 0) {
			let approvedItems = ""
			for (const approval of approvedOutputs) {
				approvedItems += `
				<div class="approval-item approved">
					<div class="approval-header">
						<span class="approval-badge approved">✓ Approved #${approval.number}</span>
						<span class="approval-filename">${approval.filename}</span>
					</div>
					<pre class="code-block">${escapeHtml(approval.content)}</pre>
				</div>
			`
			}
			approvalsHtml += `
			<div class="approvals-section">
				<h3 class="approved-header">Approved Outputs (${approvedOutputs.length})</h3>
				${approvedItems}
			</div>
		`
		}

		if (rejectedOutputs.length > 0) {
			let rejectedItems = ""
			for (const rejection of rejectedOutputs) {
				rejectedItems += `
				<div class="approval-item rejected">
					<div class="approval-header">
						<span class="approval-badge rejected">✗ Rejected #${rejection.number}</span>
						<span class="approval-filename">${rejection.filename}</span>
					</div>
					<pre class="code-block">${escapeHtml(rejection.content)}</pre>
				</div>
			`
			}
			approvalsHtml += `
			<div class="approvals-section">
				<h3 class="rejected-header">Rejected Outputs (${rejectedOutputs.length})</h3>
				${rejectedItems}
			</div>
		`
		}

		if (tc.approvals.length === 0) {
			approvalsHtml = `<div class="no-approvals">No approvals or rejections recorded yet.</div>`
		}

		let contextFilesHtml = ""
		if (tc.contextFiles.length > 0) {
			let contextItems = ""
			for (const cf of tc.contextFiles) {
				contextItems += `
				<div class="context-file">
					<div class="context-file-header">${escapeHtml(cf.filepath)}</div>
					<pre class="code-block">${escapeHtml(cf.content)}</pre>
				</div>
			`
			}
			contextFilesHtml = `
			<div class="context-files-section">
				<h3>Context Files</h3>
				${contextItems}
			</div>
		`
		}

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${tc.category}/${tc.name} - LLM Autocompletion Test</title>
	<style>
		* { box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			margin: 0;
			padding: 0;
			background: #1e1e1e;
			color: #d4d4d4;
			height: 100vh;
			display: flex;
			flex-direction: column;
		}
		.header {
			background: #252526;
			padding: 15px 20px;
			border-bottom: 1px solid #3c3c3c;
			display: flex;
			justify-content: space-between;
			align-items: center;
			flex-shrink: 0;
		}
		.header h1 {
			margin: 0;
			font-size: 1.2em;
			color: #569cd6;
		}
		.nav {
			display: flex;
			gap: 10px;
		}
		.nav a {
			color: #9cdcfe;
			text-decoration: none;
			padding: 5px 10px;
			background: #3c3c3c;
			border-radius: 3px;
		}
		.nav a:hover {
			background: #4c4c4c;
		}
		.nav a.disabled {
			color: #666;
			pointer-events: none;
		}
		.breadcrumb {
			color: #888;
			font-size: 0.9em;
		}
		.breadcrumb a {
			color: #9cdcfe;
			text-decoration: none;
		}
		.breadcrumb a:hover {
			text-decoration: underline;
		}
		.main-content {
			display: flex;
			flex: 1;
			overflow: hidden;
		}
		.panel {
			flex: 1;
			overflow-y: auto;
			padding: 20px;
			border-right: 1px solid #3c3c3c;
		}
		.panel:last-child {
			border-right: none;
		}
		.panel h2 {
			margin-top: 0;
			color: #4ec9b0;
			font-size: 1.1em;
			border-bottom: 1px solid #3c3c3c;
			padding-bottom: 10px;
		}
		.panel h3 {
			font-size: 1em;
			margin-top: 20px;
		}
		.approved-header { color: #4caf50; }
		.rejected-header { color: #f44336; }
		.meta-info {
			background: #2d2d2d;
			padding: 10px 15px;
			border-radius: 5px;
			margin-bottom: 15px;
		}
		.meta-row {
			display: flex;
			margin-bottom: 5px;
		}
		.meta-label {
			color: #888;
			width: 100px;
			flex-shrink: 0;
		}
		.meta-value {
			color: #ce9178;
		}
		.code-block {
			background: #1e1e1e;
			border: 1px solid #3c3c3c;
			border-radius: 5px;
			padding: 15px;
			overflow-x: auto;
			font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
			font-size: 13px;
			line-height: 1.5;
			white-space: pre-wrap;
			word-wrap: break-word;
		}
		.cursor-marker {
			background: #ffeb3b;
			color: #000;
			padding: 2px 6px;
			border-radius: 3px;
			font-weight: bold;
		}
		.approval-item {
			margin-bottom: 20px;
			border: 1px solid #3c3c3c;
			border-radius: 5px;
			overflow: hidden;
		}
		.approval-item.approved {
			border-color: #4caf50;
		}
		.approval-item.rejected {
			border-color: #f44336;
		}
		.approval-header {
			background: #2d2d2d;
			padding: 8px 12px;
			display: flex;
			justify-content: space-between;
			align-items: center;
		}
		.approval-badge {
			padding: 3px 8px;
			border-radius: 3px;
			font-size: 0.85em;
			font-weight: bold;
		}
		.approval-badge.approved {
			background: #1b5e20;
			color: #4caf50;
		}
		.approval-badge.rejected {
			background: #b71c1c;
			color: #f44336;
		}
		.approval-filename {
			color: #888;
			font-size: 0.85em;
		}
		.approval-item .code-block {
			border: none;
			border-radius: 0;
			margin: 0;
		}
		.no-approvals {
			color: #888;
			font-style: italic;
			padding: 20px;
			text-align: center;
		}
		.context-file {
			margin-bottom: 15px;
		}
		.context-file-header {
			background: #2d2d2d;
			padding: 8px 12px;
			border-radius: 5px 5px 0 0;
			border: 1px solid #3c3c3c;
			border-bottom: none;
			color: #dcdcaa;
			font-family: monospace;
		}
		.context-file .code-block {
			border-radius: 0 0 5px 5px;
			margin-top: 0;
		}
		.approvals-section {
			margin-bottom: 30px;
		}
		.keyboard-hint {
			position: fixed;
			bottom: 20px;
			right: 20px;
			background: #2d2d2d;
			padding: 10px 15px;
			border-radius: 5px;
			font-size: 0.85em;
			color: #888;
		}
		.keyboard-hint kbd {
			background: #3c3c3c;
			padding: 2px 6px;
			border-radius: 3px;
			margin: 0 3px;
		}
	</style>
</head>
<body>
	<div class="header">
		<div>
			<div class="breadcrumb">
				<a href="../index.html">Home</a> / ${tc.category} / ${tc.name}
			</div>
			<h1>${tc.description}</h1>
		</div>
		<div class="nav">
			<a href="${prevTest ? prevTest.name + ".html" : "#"}" class="${prevTest ? "" : "disabled"}" id="prev-link">← Previous</a>
			<a href="../index.html">Index</a>
			<a href="${nextTest ? nextTest.name + ".html" : "#"}" class="${nextTest ? "" : "disabled"}" id="next-link">Next →</a>
		</div>
	</div>

	<div class="main-content">
		<div class="panel" style="flex: 0.4;">
			<h2>Input</h2>
			<div class="meta-info">
				<div class="meta-row">
					<span class="meta-label">Filename:</span>
					<span class="meta-value">${escapeHtml(tc.filename)}</span>
				</div>
				<div class="meta-row">
					<span class="meta-label">Category:</span>
					<span class="meta-value">${escapeHtml(tc.category)}</span>
				</div>
			</div>
			<pre class="code-block">${highlightCursor(tc.input)}</pre>
			${contextFilesHtml}
		</div>
		<div class="panel" style="flex: 0.6;">
			<h2>Outputs (${tc.approvals.length} total)</h2>
			${approvalsHtml}
		</div>
	</div>

	<div class="keyboard-hint">
		<kbd>←</kbd> Previous <kbd>→</kbd> Next <kbd>H</kbd> Home
	</div>

	<script>
		document.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowLeft') {
				const prev = document.getElementById('prev-link');
				if (prev && !prev.classList.contains('disabled')) {
					prev.click();
				}
			} else if (e.key === 'ArrowRight') {
				const next = document.getElementById('next-link');
				if (next && !next.classList.contains('disabled')) {
					next.click();
				}
			} else if (e.key === 'h' || e.key === 'H') {
				window.location.href = '../index.html';
			}
		});
	</script>
</body>
</html>`
	}

	console.log("\n📊 Generating HTML Report...\n")
	console.log("Loading test cases...")

	// Load approvals for each test case
	const testCasesWithApprovals: TestCaseWithApprovals[] = testCases.map((tc) => ({
		...tc,
		approvals: loadApprovals(tc.category, tc.name),
	}))

	console.log(`Found ${testCasesWithApprovals.length} test cases`)

	// Create output directory
	if (fs.existsSync(OUTPUT_DIR)) {
		fs.rmSync(OUTPUT_DIR, { recursive: true })
	}
	fs.mkdirSync(OUTPUT_DIR, { recursive: true })

	// Generate index.html
	console.log("Generating index.html...")
	const indexHtml = generateIndexHtml(testCasesWithApprovals)
	fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), indexHtml)

	// Generate individual test case pages
	const categories = new Set(testCasesWithApprovals.map((tc) => tc.category))
	for (const category of categories) {
		const categoryDir = path.join(OUTPUT_DIR, category)
		fs.mkdirSync(categoryDir, { recursive: true })
	}

	for (const tc of testCasesWithApprovals) {
		console.log(`Generating ${tc.category}/${tc.name}.html...`)
		const html = generateTestCaseHtml(tc, testCasesWithApprovals)
		fs.writeFileSync(path.join(OUTPUT_DIR, tc.category, `${tc.name}.html`), html)
	}

	console.log(`\n✅ Done! Generated ${testCasesWithApprovals.length + 1} HTML files in ${OUTPUT_DIR}`)
	console.log(`\nOpen ${path.join(OUTPUT_DIR, "index.html")} in your browser to view the report.`)
}

// Main execution
async function main() {
	const args = process.argv.slice(2)
	const verbose = args.includes("--verbose") || args.includes("-v")
	const skipApproval = args.includes("--skip-approval") || args.includes("-sa")
	const useOpusApproval = args.includes("--opus-approval") || args.includes("-oa")

	// Parse --runs or -r option
	let numRuns = 1
	const runsIndex = args.findIndex((arg) => arg === "--runs" || arg === "-r")
	if (runsIndex !== -1 && args[runsIndex + 1]) {
		const parsedRuns = parseInt(args[runsIndex + 1], 10)
		if (!isNaN(parsedRuns) && parsedRuns > 0) {
			numRuns = parsedRuns
		}
	}

	const command = args.find((arg, index) => !arg.startsWith("-") && (runsIndex === -1 || index !== runsIndex + 1))

	try {
		if (command === "report") {
			await generateHtmlReport()
			return
		}

		// Only create TestRunner for commands that need it
		const runner = new TestRunner(verbose, skipApproval, useOpusApproval)

		if (command === "clean") {
			await runner.cleanApprovals()
		} else if (command) {
			await runner.runSingleTest(command, numRuns)
		} else {
			await runner.runAllTests(numRuns)
		}
	} catch (error) {
		console.error("\n❌ Fatal Error:", error)
		process.exit(1)
	}
}

// Check for required environment variables
function checkEnvironment() {
	const provider = process.env.LLM_PROVIDER || "kilocode"

	if (provider !== "kilocode") {
		console.error(`\n❌ Error: Only kilocode provider is supported. Got: ${provider}`)
		process.exit(1)
	}

	if (!process.env.KILOCODE_API_KEY) {
		console.error(`\n❌ Error: KILOCODE_API_KEY is not set`)
		console.log("\nPlease create a .env file with your API credentials.")
		console.log("Example: KILOCODE_API_KEY=your-api-key-here\n")
		process.exit(1)
	}
}

// Check if running a command that doesn't need API keys
const argsForCheck = process.argv.slice(2)
const commandForCheck = argsForCheck.find((arg) => !arg.startsWith("-"))
if (commandForCheck !== "report" && commandForCheck !== "clean") {
	checkEnvironment()
}
main().catch(console.error)
