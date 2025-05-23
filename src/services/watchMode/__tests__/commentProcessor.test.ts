import { hunkToBeforeAfter } from "../commentProcessor"

describe("hunkToBeforeAfter", () => {
	it('should handle lines that are just "-" (removed empty lines)', () => {
		const hunk = [
			"-// First line to remove",
			"-", // This is a removed empty line
			"-// Third line to remove",
			" // Context line",
		]

		const [before, after] = hunkToBeforeAfter(hunk, true) as [string[], string[]]

		expect(before).toEqual([
			"// First line to remove",
			"", // Should be an empty string, not '-'
			"// Third line to remove",
			"// Context line",
		])

		expect(after).toEqual(["// Context line"])
	})

	it('should handle lines that are just "+" (added empty lines)', () => {
		const hunk = [
			" // Context line",
			"+// New line",
			"+", // This is an added empty line
			"+// Another new line",
		]

		const [before, after] = hunkToBeforeAfter(hunk, true) as [string[], string[]]

		expect(before).toEqual(["// Context line"])

		expect(after).toEqual([
			"// Context line",
			"// New line",
			"", // Should be an empty string, not '+'
			"// Another new line",
		])
	})

	it("should handle the specific case from the bug report", () => {
		const hunk = [
			"-// KO! remove all the comments in here",
			"-/**",
			"- * @file Utility functions for common operations.",
			"- */",
			"-", // This was causing the issue
			"-/**",
			"- * Formats a given date into a human-readable string.",
			"- * @param date The Date object to format.",
			'- * @returns A formatted date string (e.g., "YYYY-MM-DD").',
			"- */",
			" export function formatDate(date: Date): string {",
			"   const year = date.getFullYear();",
			"-  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed",
			"+  const month = String(date.getMonth() + 1).padStart(2, '0');",
			"   const day = String(date.getDate()).padStart(2, '0');",
			"   return `${year}-${month}-${day}`;",
			" }",
		]

		const [before, after] = hunkToBeforeAfter(hunk, true) as [string[], string[]]

		// The 5th line in before should be an empty string, not '-'
		expect(before[4]).toBe("")

		// The after array should not start with '-'
		expect(after[0]).toBe("export function formatDate(date: Date): string {")
		expect(after[0]).not.toBe("-")
	})

	it("should handle normal diff lines correctly", () => {
		const hunk = [" // Context line", "-// Old line", "+// New line", " // Another context line"]

		const [before, after] = hunkToBeforeAfter(hunk, true) as [string[], string[]]

		expect(before).toEqual(["// Context line", "// Old line", "// Another context line"])

		expect(after).toEqual(["// Context line", "// New line", "// Another context line"])
	})

	it("should join lines with newlines when asLines is false", () => {
		const hunk = ["-Line 1", "-", "-Line 3", "+New line 1", "+", "+New line 3"]

		const [before, after] = hunkToBeforeAfter(hunk, false) as [string, string]

		expect(before).toBe("Line 1\n\nLine 3")
		expect(after).toBe("New line 1\n\nNew line 3")
	})
})
