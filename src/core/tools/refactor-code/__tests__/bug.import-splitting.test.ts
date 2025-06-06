import { RefactorOperation } from "../schema"
import {
	createRefactorEngineTestSetup,
	RefactorEngineTestSetup,
	createTestFilesWithAutoLoad,
} from "./utils/standardized-test-setup"
import * as fs from "fs"
import * as path from "path"

describe("Import Splitting Bug Fix", () => {
	let setup: RefactorEngineTestSetup

	beforeAll(() => {
		setup = createRefactorEngineTestSetup()
	})

	afterAll(() => {
		setup.cleanup()
	})

	test("Should properly split imports when moving functions to different files", async () => {
		// Create test files using standardized setup
		const files = {
			"utility.ts": `
export function formatName(first: string, last: string): string {
  return \`\${first} \${last}\`.trim();
}

export function formatEmail(email: string): string {
  return email.toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}
			`.trim(),
			"userService.ts": `
import { formatName, formatEmail, isValidEmail } from './utility';

export class UserService {
  public formatUser(firstName: string, lastName: string, email: string): string {
    if (!isValidEmail(email)) {
      throw new Error('Invalid email');
    }
    return \`\${formatName(firstName, lastName)} - \${formatEmail(email)}\`;
  }
}
			`.trim(),
			"validation.ts": `// Validation utilities`,
		}

		// Load files into the RefactorEngine project
		createTestFilesWithAutoLoad(setup, files)

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

		const result = await setup.engine.executeBatch({ operations: [moveOperation] })
		console.log("[TEST] Move operation result:", result)

		// Check the results
		const updatedUserServiceContent = fs.readFileSync(path.join(setup.projectDir, "userService.ts"), "utf-8")
		console.log("[TEST] Updated userService.ts content:")
		console.log(updatedUserServiceContent)

		const validationContent = fs.readFileSync(path.join(setup.projectDir, "validation.ts"), "utf-8")
		console.log("[TEST] validation.ts content:")
		console.log(validationContent)

		const utilityContent = fs.readFileSync(path.join(setup.projectDir, "utility.ts"), "utf-8")
		console.log("[TEST] Updated utility.ts content:")
		console.log(utilityContent)

		// Verify that imports were properly split
		expect(updatedUserServiceContent).toContain("import { formatName, formatEmail } from './utility'")
		expect(updatedUserServiceContent).toContain("import { isValidEmail } from './validation'")

		// Verify that isValidEmail was moved to validation.ts
		expect(validationContent).toContain("export function isValidEmail")

		// Verify that isValidEmail was removed from utility.ts
		expect(utilityContent).not.toContain("isValidEmail")
	})
})
