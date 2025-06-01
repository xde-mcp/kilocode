import { RobustLLMRefactorParser, RefactorParseError } from "../parser"

// Mock the schema import
jest.mock("../schema", () => {
	return {
		// Create a mock schema that just returns the input without validation
		RefactorOperationSchema: {
			safeParse: jest.fn().mockImplementation((obj) => ({
				success: true,
				data: obj,
			})),
		},
	}
})

describe("RobustLLMRefactorParser", () => {
	let parser: RobustLLMRefactorParser

	beforeEach(() => {
		parser = new RobustLLMRefactorParser()
	})

	test("parses a simple JSON array", () => {
		const input = `[
      {
        "operation": "rename",
        "selector": {
          "type": "identifier",
          "name": "formatUserName",
          "kind": "function",
          "filePath": "src/utils/formatting.ts"
        },
        "newName": "formatFullName",
        "reason": "More accurately describes the function's purpose"
      }
    ]`

		const result = parser.parseResponse(input)
		expect(result).toHaveLength(1)
		expect(result[0].operation).toBe("rename")
		expect(result[0].selector.name).toBe("formatUserName")
		expect(result[0].newName).toBe("formatFullName")
	})

	test("parses JSON within code blocks", () => {
		const input =
			"```json\n" +
			`[
        {
          "operation": "rename",
          "selector": {
            "type": "identifier",
            "name": "formatUserName",
            "kind": "function",
            "filePath": "src/utils/formatting.ts"
          },
          "newName": "formatFullName",
          "reason": "More accurately describes the function's purpose"
        }
      ]` +
			"\n```"

		const result = parser.parseResponse(input)
		expect(result).toHaveLength(1)
		expect(result[0].operation).toBe("rename")
		expect(result[0].selector.name).toBe("formatUserName")
	})

	test("parses JSON within operations tags", () => {
		const input =
			"<operations>\n" +
			`[
        {
          "operation": "rename",
          "selector": {
            "type": "identifier",
            "name": "formatUserName",
            "kind": "function",
            "filePath": "src/utils/formatting.ts"
          },
          "newName": "formatFullName",
          "reason": "More accurately describes the function's purpose"
        }
      ]` +
			"\n</operations>"

		const result = parser.parseResponse(input)
		expect(result).toHaveLength(1)
		expect(result[0].operation).toBe("rename")
		expect(result[0].selector.name).toBe("formatUserName")
	})

	test("parses JSON with single quotes", () => {
		const input = `[
      {
        'operation': 'rename',
        'selector': {
          'type': 'identifier',
          'name': 'formatUserName',
          'kind': 'function',
          'filePath': 'src/utils/formatting.ts'
        },
        'newName': 'formatFullName',
        'reason': 'More accurately describes the function purpose'
      }
    ]`

		const result = parser.parseResponse(input)
		expect(result).toHaveLength(1)
		expect(result[0].operation).toBe("rename")
		expect(result[0].selector.name).toBe("formatUserName")
	})

	test("parses JSON with trailing commas", () => {
		const input = `[
      {
        "operation": "rename",
        "selector": {
          "type": "identifier",
          "name": "formatUserName",
          "kind": "function",
          "filePath": "src/utils/formatting.ts",
        },
        "newName": "formatFullName",
        "reason": "More accurately describes the function's purpose",
      },
    ]`

		const result = parser.parseResponse(input)
		expect(result).toHaveLength(1)
		expect(result[0].operation).toBe("rename")
		expect(result[0].selector.name).toBe("formatUserName")
	})

	test("parses multiple operations", () => {
		const input = `[
      {
        "operation": "rename",
        "selector": {
          "type": "identifier",
          "name": "User",
          "kind": "interface",
          "filePath": "src/models/User.ts"
        },
        "newName": "UserProfile",
        "reason": "More specific naming to distinguish from UserAccount"
      },
      {
        "operation": "move",
        "selector": {
          "type": "identifier",
          "name": "getUserData",
          "kind": "function",
          "filePath": "src/services/userService.ts"
        },
        "targetFilePath": "src/services/profileService.ts",
        "reason": "Organizing user profile related functions together"
      }
    ]`

		const result = parser.parseResponse(input)
		expect(result).toHaveLength(2)
		expect(result[0].operation).toBe("rename")
		expect(result[1].operation).toBe("move")
	})

	test("throws error for invalid JSON", () => {
		const input = `{
      "operation": "invalid,
      missing closing quote and other issues
    }`

		expect(() => parser.parseResponse(input)).toThrow(RefactorParseError)
	})

	test("throws error for empty input", () => {
		const input = ``
		expect(() => parser.parseResponse(input)).toThrow(RefactorParseError)
	})

	test("parses operations within text context", () => {
		const input = `
    Here's how to refactor the code:

    \`\`\`json
    [
      {
        "operation": "rename",
        "selector": {
          "type": "identifier",
          "name": "formatUserName",
          "kind": "function",
          "filePath": "src/utils/formatting.ts"
        },
        "newName": "formatFullName",
        "reason": "More accurately describes the function's purpose"
      }
    ]
    \`\`\`

    This will improve readability.
    `

		const result = parser.parseResponse(input)
		expect(result).toHaveLength(1)
		expect(result[0].operation).toBe("rename")
		expect(result[0].selector.name).toBe("formatUserName")
	})
})
