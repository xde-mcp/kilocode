import { RefactorEngine } from "../engine"
import { RefactorOperation } from "../schema"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { createTestDirectory, cleanupTestDirectory } from "./utils/test-directory"

describe("Import Splitting Bug Fix", () => {
	let tempDir: string
	let engine: RefactorEngine

	beforeEach(() => {
		// Create a temporary directory for test files using standardized prefix
		tempDir = createTestDirectory("import-splitting")
		engine = new RefactorEngine({ projectRootPath: tempDir })
	})

	afterEach(() => {
		// Clean up temporary directory using standardized cleanup
		cleanupTestDirectory(tempDir)
	})

	test("Should properly split imports when moving functions to different files", async () => {
		// Create source files
		const utilityFile = path.join(tempDir, "utility.ts")
		const userServiceFile = path.join(tempDir, "userService.ts")
		const validationFile = path.join(tempDir, "validation.ts")

		// Create utility.ts with three functions
		fs.writeFileSync(
			utilityFile,
			`
export function formatName(first: string, last: string): string {
  return \`\${first} \${last}\`.trim();
}

export function formatEmail(email: string): string {
  return email.toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}
`,
		)

		// Create userService.ts that imports all three functions
		fs.writeFileSync(
			userServiceFile,
			`
import { formatName, formatEmail, isValidEmail } from './utility';

export class UserService {
  public formatUser(firstName: string, lastName: string, email: string): string {
    if (!isValidEmail(email)) {
      throw new Error('Invalid email');
    }
    return \`\${formatName(firstName, lastName)} - \${formatEmail(email)}\`;
  }
}
`,
		)

		// Create empty validation.ts file
		fs.writeFileSync(validationFile, `// Validation utilities\n`)

		console.log("[TEST] Initial userService.ts content:")
		console.log(fs.readFileSync(userServiceFile, "utf-8"))

		// Move isValidEmail from utility.ts to validation.ts
		const moveOperation: RefactorOperation = {
			operation: "move",
			selector: {
				type: "identifier",
				name: "isValidEmail",
				kind: "function",
				filePath: "utility.ts",
			},
			targetFilePath: "validation.ts",
		}

		const result = await engine.executeBatch({ operations: [moveOperation] })
		console.log("[TEST] Move operation result:", result)

		// Check the results
		const updatedUserServiceContent = fs.readFileSync(userServiceFile, "utf-8")
		console.log("[TEST] Updated userService.ts content:")
		console.log(updatedUserServiceContent)

		const validationContent = fs.readFileSync(validationFile, "utf-8")
		console.log("[TEST] validation.ts content:")
		console.log(validationContent)

		const utilityContent = fs.readFileSync(utilityFile, "utf-8")
		console.log("[TEST] Updated utility.ts content:")
		console.log(utilityContent)

		// Verify that imports were properly split
		expect(updatedUserServiceContent).toContain("import { formatName, formatEmail } from './utility'")
		expect(updatedUserServiceContent).toContain('import { isValidEmail } from "./validation"')

		// Verify that isValidEmail was moved to validation.ts
		expect(validationContent).toContain("export function isValidEmail")

		// Verify that isValidEmail was removed from utility.ts
		expect(utilityContent).not.toContain("isValidEmail")
	})
})
