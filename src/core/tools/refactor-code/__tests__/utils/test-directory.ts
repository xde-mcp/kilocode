import * as fs from "fs"
import * as path from "path"
import * as os from "os"

/**
 * Centralized test directory management for RefactorCodeTool tests.
 * Ensures all tests use a consistent prefix for reliable test environment detection.
 */

const TEST_PREFIX = "refactor-tool-test"

/**
 * Creates a temporary test directory with the standard prefix
 */
export function createTestDirectory(testName: string): string {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${TEST_PREFIX}-${testName}-`))
	console.log(`[TEST-DIR] Created test directory: ${tempDir}`)
	return tempDir
}

/**
 * Creates a test project directory with the standard prefix
 */
export function createTestProjectDirectory(testName: string): string {
	const baseDir = createTestDirectory(testName)
	const projectDir = path.join(baseDir, "project")
	fs.mkdirSync(projectDir, { recursive: true })
	console.log(`[TEST-DIR] Created test project directory: ${projectDir}`)
	return projectDir
}

/**
 * Cleans up a test directory
 */
export function cleanupTestDirectory(testDir: string): void {
	try {
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true })
			console.log(`[TEST-DIR] Cleaned up test directory: ${testDir}`)
		}
	} catch (error) {
		console.warn(`[TEST-DIR] Failed to cleanup test directory: ${error}`)
	}
}

/**
 * Checks if a path is a test directory based on our standard prefix
 */
export function isTestDirectory(dirPath: string): boolean {
	return dirPath.includes(TEST_PREFIX)
}

/**
 * Gets the standard test prefix used by all RefactorCodeTool tests
 */
export function getTestPrefix(): string {
	return TEST_PREFIX
}
