import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "fs"
import path from "path"
import readline from "readline"
import { checkApproval, renumberApprovals } from "./approvals.js"

const TEST_APPROVALS_DIR = "approvals"
const TEST_CATEGORY = "test-category"
const TEST_NAME = "test-case"

describe("approvals", () => {
	beforeEach(() => {
		if (fs.existsSync(TEST_APPROVALS_DIR)) {
			fs.rmSync(TEST_APPROVALS_DIR, { recursive: true })
		}
	})

	afterEach(() => {
		if (fs.existsSync(TEST_APPROVALS_DIR)) {
			fs.rmSync(TEST_APPROVALS_DIR, { recursive: true })
		}
	})

	describe("file structure", () => {
		it("should create flat file structure with correct naming", async () => {
			vi.spyOn(readline, "createInterface").mockReturnValue({
				question: (_prompt: string, callback: (answer: string) => void) => {
					callback("y")
				},
				close: () => {},
			} as any)

			const input = "test input"
			const output = "test output"

			await checkApproval(TEST_CATEGORY, TEST_NAME, input, output)

			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			expect(fs.existsSync(categoryDir)).toBe(true)

			const files = fs.readdirSync(categoryDir)
			expect(files).toContain(`${TEST_NAME}.approved.1.txt`)

			const content = fs.readFileSync(path.join(categoryDir, `${TEST_NAME}.approved.1.txt`), "utf-8")
			expect(content).toBe(output)
		})

		it("should increment file numbers for multiple approvals", async () => {
			vi.spyOn(readline, "createInterface").mockReturnValue({
				question: (_prompt: string, callback: (answer: string) => void) => {
					callback("y")
				},
				close: () => {},
			} as any)

			await checkApproval(TEST_CATEGORY, TEST_NAME, "input1", "output1")
			await checkApproval(TEST_CATEGORY, TEST_NAME, "input2", "output2")
			await checkApproval(TEST_CATEGORY, TEST_NAME, "input3", "output3")

			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			const files = fs.readdirSync(categoryDir)

			expect(files).toContain(`${TEST_NAME}.approved.1.txt`)
			expect(files).toContain(`${TEST_NAME}.approved.2.txt`)
			expect(files).toContain(`${TEST_NAME}.approved.3.txt`)
		})

		it("should handle rejected outputs with correct naming", async () => {
			vi.spyOn(readline, "createInterface").mockReturnValue({
				question: (_prompt: string, callback: (answer: string) => void) => {
					callback("n")
				},
				close: () => {},
			} as any)

			await checkApproval(TEST_CATEGORY, TEST_NAME, "input", "output")

			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			const files = fs.readdirSync(categoryDir)

			expect(files).toContain(`${TEST_NAME}.rejected.1.txt`)
		})

		it("should use globally unique numbers across approved and rejected", async () => {
			let callCount = 0
			vi.spyOn(readline, "createInterface").mockReturnValue({
				question: (_prompt: string, callback: (answer: string) => void) => {
					// First call: approve, second call: reject, third call: approve
					callCount++
					callback(callCount === 2 ? "n" : "y")
				},
				close: () => {},
			} as any)

			await checkApproval(TEST_CATEGORY, TEST_NAME, "input1", "output1") // approved.1
			await checkApproval(TEST_CATEGORY, TEST_NAME, "input2", "output2") // rejected.2
			await checkApproval(TEST_CATEGORY, TEST_NAME, "input3", "output3") // approved.3

			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			const files = fs.readdirSync(categoryDir)

			expect(files).toContain(`${TEST_NAME}.approved.1.txt`)
			expect(files).toContain(`${TEST_NAME}.rejected.2.txt`)
			expect(files).toContain(`${TEST_NAME}.approved.3.txt`)
			expect(files).toHaveLength(3)
		})
	})

	describe("matching existing files", () => {
		it("should match approved output and not prompt user", async () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			const output = "test output"
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.1.txt`), output, "utf-8")

			const result = await checkApproval(TEST_CATEGORY, TEST_NAME, "input", output)

			expect(result.isApproved).toBe(true)
			expect(result.newOutput).toBe(false)
		})

		it("should match rejected output and not prompt user", async () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			const output = "test output"
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.rejected.1.txt`), output, "utf-8")

			const result = await checkApproval(TEST_CATEGORY, TEST_NAME, "input", output)

			expect(result.isApproved).toBe(false)
			expect(result.newOutput).toBe(false)
		})

		it("should match with different file numbers", async () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			const output = "test output"
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.5.txt`), output, "utf-8")

			const result = await checkApproval(TEST_CATEGORY, TEST_NAME, "input", output)

			expect(result.isApproved).toBe(true)
			expect(result.newOutput).toBe(false)
		})
	})

	describe("multiple test cases in same category", () => {
		it("should keep files for different test cases separate", async () => {
			vi.spyOn(readline, "createInterface").mockReturnValue({
				question: (_prompt: string, callback: (answer: string) => void) => {
					callback("y")
				},
				close: () => {},
			} as any)

			await checkApproval(TEST_CATEGORY, "test-case-1", "input1", "output1")
			await checkApproval(TEST_CATEGORY, "test-case-2", "input2", "output2")

			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			const files = fs.readdirSync(categoryDir)

			expect(files).toContain("test-case-1.approved.1.txt")
			expect(files).toContain("test-case-2.approved.1.txt")
			expect(files).toHaveLength(2)
		})
	})

	describe("newOutput flag", () => {
		it("should set newOutput to true for new approvals", async () => {
			vi.spyOn(readline, "createInterface").mockReturnValue({
				question: (_prompt: string, callback: (answer: string) => void) => {
					callback("y")
				},
				close: () => {},
			} as any)

			const result = await checkApproval(TEST_CATEGORY, TEST_NAME, "input", "output")

			expect(result.newOutput).toBe(true)
		})

		it("should set newOutput to false for existing matches", async () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			const output = "test output"
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.1.txt`), output, "utf-8")

			const result = await checkApproval(TEST_CATEGORY, TEST_NAME, "input", output)

			expect(result.newOutput).toBe(false)
		})
	})

	describe("renumberApprovals", () => {
		it("should renumber files with duplicate numbers", () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			// Create files with duplicate numbers (approved.1 and rejected.1)
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.1.txt`), "output1", "utf-8")
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.rejected.1.txt`), "output2", "utf-8")

			const result = renumberApprovals(TEST_APPROVALS_DIR)

			expect(result.renamedCount).toBeGreaterThan(0)

			const files = fs.readdirSync(categoryDir)
			const numbers = files.map((f) => {
				const match = f.match(/\.(\d+)\.txt$/)
				return match ? parseInt(match[1], 10) : 0
			})

			// All numbers should be unique
			const uniqueNumbers = new Set(numbers)
			expect(uniqueNumbers.size).toBe(numbers.length)
		})

		it("should renumber files with gaps", () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			// Create files with gaps (1, 3, 5)
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.1.txt`), "output1", "utf-8")
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.3.txt`), "output2", "utf-8")
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.5.txt`), "output3", "utf-8")

			const result = renumberApprovals(TEST_APPROVALS_DIR)

			expect(result.renamedCount).toBeGreaterThan(0)

			const files = fs.readdirSync(categoryDir)
			expect(files).toContain(`${TEST_NAME}.approved.1.txt`)
			expect(files).toContain(`${TEST_NAME}.approved.2.txt`)
			expect(files).toContain(`${TEST_NAME}.approved.3.txt`)
		})

		it("should not rename files that are already sequential", () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			// Create files that are already sequential
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.1.txt`), "output1", "utf-8")
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.rejected.2.txt`), "output2", "utf-8")
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.3.txt`), "output3", "utf-8")

			const result = renumberApprovals(TEST_APPROVALS_DIR)

			expect(result.renamedCount).toBe(0)
		})

		it("should return zero counts for non-existent directory", () => {
			const result = renumberApprovals("non-existent-dir")

			expect(result.renamedCount).toBe(0)
			expect(result.totalFiles).toBe(0)
		})
	})

	describe("skip-approval mode", () => {
		it("should mark new outputs as unknown with newOutput=true", async () => {
			const result = await checkApproval(TEST_CATEGORY, TEST_NAME, "input", "output", true)

			expect(result.isApproved).toBe(false)
			expect(result.newOutput).toBe(true)
		})

		it("should still pass for previously approved outputs", async () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			const output = "test output"
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.approved.1.txt`), output, "utf-8")

			const result = await checkApproval(TEST_CATEGORY, TEST_NAME, "input", output, true)

			expect(result.isApproved).toBe(true)
			expect(result.newOutput).toBe(false)
		})

		it("should still fail for previously rejected outputs", async () => {
			const categoryDir = path.join(TEST_APPROVALS_DIR, TEST_CATEGORY)
			fs.mkdirSync(categoryDir, { recursive: true })

			const output = "test output"
			fs.writeFileSync(path.join(categoryDir, `${TEST_NAME}.rejected.1.txt`), output, "utf-8")

			const result = await checkApproval(TEST_CATEGORY, TEST_NAME, "input", output, true)

			expect(result.isApproved).toBe(false)
			expect(result.newOutput).toBe(false)
		})
	})
})
