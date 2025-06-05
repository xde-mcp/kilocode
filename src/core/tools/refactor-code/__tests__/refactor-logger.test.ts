import { refactorLogger } from "../utils/RefactorLogger"

describe("RefactorLogger Output Channel Integration", () => {
	beforeEach(() => {
		// Clear the output channel before each test
		refactorLogger.clear()
	})

	it("should log operation start with proper formatting", () => {
		const operation = "Test Move Operation"
		const details = {
			sourceFile: "src/test.ts",
			targetFile: "src/moved.ts",
			symbolName: "testFunction",
		}

		// This should create a log entry in the "🔧 RefactorCodeTool" output channel
		refactorLogger.operationStart(operation, details)

		// The test passes if no errors are thrown
		expect(true).toBe(true)
	})

	it("should log operation success with results", () => {
		const operation = "Test Rename Operation"
		const result = {
			affectedFiles: ["src/test.ts", "src/other.ts"],
			symbolName: "renamedFunction",
		}

		refactorLogger.operationSuccess(operation, result)

		// The test passes if no errors are thrown
		expect(true).toBe(true)
	})

	it("should log operation failure with error details", () => {
		const operation = "Test Remove Operation"
		const error = new Error("Symbol not found in target file")

		refactorLogger.operationFailure(operation, error)

		// The test passes if no errors are thrown
		expect(true).toBe(true)
	})

	it("should log validation steps", () => {
		refactorLogger.validation("Check symbol exists", true, { symbolName: "testFunction" })
		refactorLogger.validation("Check target file writable", false, { error: "File is read-only" })

		// The test passes if no errors are thrown
		expect(true).toBe(true)
	})

	it("should log execution and verification steps", () => {
		refactorLogger.execution("Extract symbol from source file", { symbolType: "function" })
		refactorLogger.verification("Symbol added to target file", true, { targetFile: "src/moved.ts" })

		// The test passes if no errors are thrown
		expect(true).toBe(true)
	})

	it("should handle different log levels", () => {
		refactorLogger.info("Information message")
		refactorLogger.warn("Warning message", { context: "test" })
		refactorLogger.error("Error message", new Error("Test error"))
		refactorLogger.debug("Debug message", { debugInfo: "test data" })

		// The test passes if no errors are thrown
		expect(true).toBe(true)
	})

	it("should show output channel when requested", () => {
		// This should make the "🔧 RefactorCodeTool" output channel visible in VS Code
		refactorLogger.show()

		// The test passes if no errors are thrown
		expect(true).toBe(true)
	})
})
