import { Project } from "ts-morph"
import { RefactorEngine } from "../../engine"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

/**
 * Standardized Test Setup Utilities for RefactorCodeTool
 *
 * This module provides consistent test setup patterns to eliminate
 * the inconsistencies causing test failures across the RefactorCodeTool suite.
 *
 * All test directories use the "refactor-tool-test" prefix for proper
 * test environment detection.
 */

export interface StandardTestSetup {
	tempDir: string
	project: Project
	cleanup: () => void
}

export interface RefactorEngineTestSetup {
	tempDir: string
	projectDir: string
	engine: RefactorEngine
	cleanup: () => void
}

/**
 * Pattern 1: Simple ts-morph Project with temp directory
 *
 * Use this for:
 * - Direct ts-morph operations
 * - MoveExecutor, SymbolExtractor, etc. unit tests
 * - Tests that need file system operations but not RefactorEngine
 */
export function createSimpleTestSetup(): StandardTestSetup {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "refactor-tool-test-simple-"))

	const project = new Project({
		useInMemoryFileSystem: false,
		compilerOptions: {
			target: 99, // Latest
			module: 99, // ESNext
			strict: true,
			esModuleInterop: true,
			skipLibCheck: true,
			forceConsistentCasingInFileNames: true,
		},
	})

	return {
		tempDir,
		project,
		cleanup: () => {
			if (fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true })
			}
		},
	}
}

/**
 * Pattern 2: RefactorEngine with proper test isolation
 *
 * Use this for:
 * - Integration tests using RefactorEngine
 * - Batch operation tests
 * - End-to-end refactoring workflows
 */
export function createRefactorEngineTestSetup(): RefactorEngineTestSetup {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "refactor-tool-test-engine-"))
	const projectDir = path.join(tempDir, "project")

	// Create project directory structure
	fs.mkdirSync(projectDir, { recursive: true })

	const engine = new RefactorEngine({
		projectRootPath: projectDir,
	})

	return {
		tempDir,
		projectDir,
		engine,
		cleanup: () => {
			if (fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true })
			}
		},
	}
}

/**
 * Enhanced Pattern 2: RefactorEngine with Automatic File Loading
 *
 * Use this for:
 * - Integration tests that need cross-file reference detection
 * - Tests that require all project files to be loaded for ts-morph
 * - Rename operations that need to find references across multiple files
 */
export function createRefactorEngineTestSetupWithAutoLoad(): RefactorEngineTestSetup {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "refactor-tool-test-engine-"))
	const projectDir = path.join(tempDir, "project")

	// Create project directory
	fs.mkdirSync(projectDir, { recursive: true })

	const engine = new RefactorEngine({
		projectRootPath: projectDir,
	})

	return {
		tempDir,
		projectDir,
		engine,
		cleanup: () => {
			if (fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true })
			}
		},
	}
}

/**
 * Enhanced test file creation that automatically loads files into RefactorEngine
 */
export function createTestFilesWithAutoLoad(
	setup: RefactorEngineTestSetup,
	files: TestFileStructure,
): { [fileName: string]: string } {
	const filePaths: { [fileName: string]: string } = {}

	// Create files on disk
	for (const [fileName, content] of Object.entries(files)) {
		const filePath = path.join(setup.projectDir, fileName)
		const dir = path.dirname(filePath)

		// Ensure directory exists
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}

		// Write file
		fs.writeFileSync(filePath, content, "utf-8")
		filePaths[fileName] = filePath
	}

	// CRITICAL: Load all TypeScript files into the RefactorEngine's project
	// This ensures ts-morph can find cross-file references
	const tsFiles = Object.keys(files)
		.filter((fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx"))
		.map((fileName) => path.join(setup.projectDir, fileName))

	if (tsFiles.length > 0) {
		console.log(`[DEBUG SETUP] Loading ${tsFiles.length} TypeScript files into RefactorEngine project`)

		// Use the engine's project manager to load files
		const project = (setup.engine as any).project // Access internal project
		if (project && project.addSourceFilesAtPaths) {
			project.addSourceFilesAtPaths(tsFiles)
			console.log(`[DEBUG SETUP] Successfully loaded ${tsFiles.length} files into ts-morph project`)
		}
	}

	return filePaths
}

/**
 * Pattern 3: In-Memory FileSystem for pure unit tests
 *
 * Use this for:
 * - Pure unit tests that don't need file system
 * - Fast tests that only test ts-morph operations
 * - Tests that don't need path resolution
 */
export function createInMemoryTestSetup(): { project: Project } {
	const project = new Project({
		useInMemoryFileSystem: true,
		compilerOptions: {
			target: 99, // Latest
			module: 99, // ESNext
			strict: true,
			esModuleInterop: true,
			skipLibCheck: true,
			forceConsistentCasingInFileNames: true,
		},
	})

	return { project }
}

/**
 * Standard test file creation utilities
 */
export interface TestFileStructure {
	[fileName: string]: string
}

export function createTestFiles(baseDir: string, files: TestFileStructure): { [fileName: string]: string } {
	const filePaths: { [fileName: string]: string } = {}

	for (const [fileName, content] of Object.entries(files)) {
		const filePath = path.join(baseDir, fileName)
		const dir = path.dirname(filePath)

		// Ensure directory exists
		fs.mkdirSync(dir, { recursive: true })

		// Write file
		fs.writeFileSync(filePath, content)
		filePaths[fileName] = filePath
	}

	return filePaths
}

/**
 * Standard test file templates
 */
export const TEST_FILE_TEMPLATES = {
	simpleFunction: `
export function testFunction(): boolean {
	return true;
}
`,

	userModel: `
export interface User {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	role: 'admin' | 'user';
}

export type UserRole = 'admin' | 'user' | 'guest';

export function validateUser(user: User): boolean {
	return !!user.email;
}
`,

	utilityFunctions: `
export function formatName(first: string, last: string): string {
	return \`\${first} \${last}\`.trim();
}

export function capitalizeString(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
`,

	serviceClass: `
import { User } from './user';

export class UserService {
	private users: User[] = [];

	public addUser(user: User): void {
		this.users.push(user);
	}

	public getUser(id: string): User | undefined {
		return this.users.find(u => u.id === id);
	}
}
`,
}

/**
 * Standard assertions for test verification
 */
export function assertFileExists(filePath: string): void {
	if (!fs.existsSync(filePath)) {
		throw new Error(`Expected file to exist: ${filePath}`)
	}
}

export function assertFileContains(filePath: string, text: string): void {
	assertFileExists(filePath)
	const content = fs.readFileSync(filePath, "utf-8")
	if (!content.includes(text)) {
		throw new Error(`Expected file ${filePath} to contain: ${text}`)
	}
}

export function assertFileNotContains(filePath: string, text: string): void {
	assertFileExists(filePath)
	const content = fs.readFileSync(filePath, "utf-8")
	if (content.includes(text)) {
		throw new Error(`Expected file ${filePath} to NOT contain: ${text}`)
	}
}

/**
 * Performance measurement utilities
 */
export async function measurePerformance<T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> {
	const start = performance.now()
	const result = await operation()
	const duration = performance.now() - start
	return { result, duration }
}
