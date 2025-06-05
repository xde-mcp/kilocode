import * as path from "path"
import * as fs from "fs"

/**
 * Utility to help debug test performance issues, adjust timeouts automatically,
 * and manage memory efficiently during tests.
 */

/**
 * Default timeout for refactor tests - longer than standard Jest timeout
 * to accommodate the complex operations performed in these tests
 */
export const DEFAULT_REFACTOR_TIMEOUT = 30000 // 30 seconds

/**
 * Sets a longer timeout for complex refactoring tests
 *
 * @param timeout - Custom timeout in milliseconds (default: 30000ms)
 */
export function setRefactorTestTimeout(timeout: number = DEFAULT_REFACTOR_TIMEOUT): void {
	if (typeof jest !== "undefined") {
		jest.setTimeout(timeout)
	}
}

/**
 * Helper function to request garbage collection if available
 * This needs the Node --expose-gc flag to work
 *
 * @returns Whether garbage collection was triggered
 */
export function tryForceGC(): boolean {
	if (global.gc) {
		try {
			global.gc()
			return true
		} catch (e) {
			console.error("Error triggering garbage collection:", e)
		}
	}
	return false
}

/**
 * Simple helper to log test timing information
 */
export class TestTimer {
	private startTime: number
	private name: string
	private checkpoints: Array<{ name: string; time: number }> = []

	constructor(testName: string) {
		this.name = testName
		this.startTime = Date.now()
		console.log(`[TEST-TIMER] Starting test: ${testName}`)
	}

	/**
	 * Record a checkpoint in the test
	 */
	checkpoint(name: string): void {
		const elapsed = Date.now() - this.startTime
		this.checkpoints.push({ name, time: elapsed })
		console.log(`[TEST-TIMER] ${this.name} - ${name}: ${elapsed}ms`)
	}

	/**
	 * End timing and report results
	 */
	end(): { total: number; checkpoints: Array<{ name: string; time: number }> } {
		const totalTime = Date.now() - this.startTime
		console.log(`[TEST-TIMER] ${this.name} completed in ${totalTime}ms`)

		if (this.checkpoints.length > 0) {
			console.log(`[TEST-TIMER] Checkpoints:`)
			let prevTime = 0
			this.checkpoints.forEach((cp) => {
				const segmentTime = cp.time - prevTime
				console.log(`[TEST-TIMER]   - ${cp.name}: ${cp.time}ms (segment: ${segmentTime}ms)`)
				prevTime = cp.time
			})
		}

		return {
			total: totalTime,
			checkpoints: this.checkpoints,
		}
	}
}

/**
 * Creates a minimal temp directory structure for tests
 * This is a lightweight alternative to using the full test file setup.
 * This optimized version creates fewer files with less content to reduce memory usage.
 */
export function createMinimalTestFiles(
	tempDir: string,
	additionalFiles: Record<string, string> = {},
	useUltraMinimal: boolean = false,
): Record<string, string> {
	// Create necessary directories
	fs.mkdirSync(path.join(tempDir, "src", "utils"), { recursive: true })

	// Use ultra-minimal test files when memory is a concern
	if (useUltraMinimal) {
		// Create single minimal file
		const utilsFile = path.join(tempDir, "src", "utils", "helpers.ts")
		fs.writeFileSync(utilsFile, `export function format(s: string): string { return s; }`)

		// Return minimal fixture set
		const createdFiles: Record<string, string> = { utilsFile }
		return createdFiles
	}

	// Standard minimal setup
	fs.mkdirSync(path.join(tempDir, "src", "services"), { recursive: true })
	fs.mkdirSync(path.join(tempDir, "src", "models"), { recursive: true })

	// Create basic files with reduced content
	const utilsFile = path.join(tempDir, "src", "utils", "helpers.ts")
	const serviceFile = path.join(tempDir, "src", "services", "userService.ts")
	const modelFile = path.join(tempDir, "src", "models", "user.ts")

	// Write minimal content to the files
	fs.writeFileSync(utilsFile, `export function formatName(name: string): string { return name; }`)
	fs.writeFileSync(
		serviceFile,
		`import { formatName } from "../utils/helpers"; export function getUserInfo(id: number) { return { name: formatName("Test") }; }`,
	)
	fs.writeFileSync(modelFile, `export interface User { id: number; name: string; }`)

	// Add any additional files
	const createdFiles: Record<string, string> = { utilsFile, serviceFile, modelFile }

	Object.entries(additionalFiles).forEach(([filePath, content]) => {
		const fullPath = path.join(tempDir, filePath)
		const dirPath = path.dirname(fullPath)

		// Ensure directory exists
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true })
		}

		fs.writeFileSync(fullPath, content)
		createdFiles[filePath] = fullPath
	})

	// Suggest garbage collection after creating files
	tryForceGC()

	return createdFiles
}

/**
 * Creates a memory-efficient test fixture that cleans up after itself.
 * Returns both the created files and a cleanup function.
 *
 * @param tempDir - The directory where test files should be created
 * @param additionalFiles - Optional additional files to create
 * @returns Object containing files and a cleanup function
 */
export function createCleanableTestFixture(
	tempDir: string,
	additionalFiles: Record<string, string> = {},
): { files: Record<string, string>; cleanup: () => void } {
	// Create the files
	const files = createMinimalTestFiles(tempDir, additionalFiles, true)

	// Return a cleanup function along with the files
	return {
		files,
		cleanup: () => {
			// Clear references to help garbage collection
			Object.keys(files).forEach((key) => {
				files[key] = ""
			})

			// Force garbage collection if available
			tryForceGC()
		},
	}
}
