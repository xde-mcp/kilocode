import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const CURSOR_MARKER = "<<<AUTOCOMPLETE_HERE>>>"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ContextFile {
	filepath: string
	content: string
}

interface CategoryTestCase {
	name: string
	input: string
	description: string
	filename: string
	contextFiles: ContextFile[]
}

export interface TestCase extends CategoryTestCase {
	category: string
}

export interface Category {
	name: string
	testCases: CategoryTestCase[]
}

const TEST_CASES_DIR = path.join(__dirname, "test-cases")

function parseHeaders(
	lines: string[],
	startIndex: number,
	headerPattern: RegExp,
	requiredHeaders: string[],
	filePath?: string,
): { headers: Record<string, string>; contentStartIndex: number } {
	const headers: Record<string, string> = {}
	let contentStartIndex = startIndex

	for (let i = startIndex; i < lines.length; i++) {
		const line = lines[i]
		const headerMatch = line.match(headerPattern)

		if (headerMatch) {
			const [, name, value] = headerMatch
			headers[name.toLowerCase()] = value.trim()
			contentStartIndex = i + 1
		} else {
			// Stop parsing headers when we hit a non-header line
			break
		}
	}

	// Validate required headers
	const missingHeaders = requiredHeaders.filter((header) => !headers[header])
	if (missingHeaders.length > 0) {
		const location = filePath ? `: ${filePath}` : ""
		throw new Error(`Invalid test case file format${location}. Missing headers: ${missingHeaders.join(", ")}`)
	}

	return { headers, contentStartIndex }
}

/**
 * Reads lines from startIndex until the next header pattern is found or end of file.
 * Returns the content and the index where the next header starts (or lines.length if none found).
 */
function readUntilHeaders(
	lines: string[],
	startIndex: number,
	headerPattern: RegExp,
): { content: string; nextHeaderIndex: number } {
	const contentLines: string[] = []

	for (let i = startIndex; i < lines.length; i++) {
		const line = lines[i]
		if (headerPattern.test(line)) {
			return { content: contentLines.join("\n"), nextHeaderIndex: i }
		}
		contentLines.push(line)
	}

	return { content: contentLines.join("\n"), nextHeaderIndex: lines.length }
}

// Header patterns for different levels (both use same format: #### key: value or ##### key: value)
const MAIN_HEADER_PATTERN = /^#### ([^:]+):\s*(.*)$/
const CONTEXT_FILE_HEADER_PATTERN = /^##### ([^:]+):\s*(.*)$/

function parseContextFiles(lines: string[], startIndex: number): { mainContent: string; contextFiles: ContextFile[] } {
	const contextFiles: ContextFile[] = []

	// Read main content until we hit a context file header (##### filepath: value)
	const { content: mainContent, nextHeaderIndex } = readUntilHeaders(lines, startIndex, CONTEXT_FILE_HEADER_PATTERN)

	// Parse remaining context files
	let currentIndex = nextHeaderIndex
	while (currentIndex < lines.length) {
		// Parse the context file header (##### filepath: path/to/file)
		const { headers, contentStartIndex } = parseHeaders(lines, currentIndex, CONTEXT_FILE_HEADER_PATTERN, [
			"filepath",
		])

		// Read content until next context file header or end of file
		const { content: fileContent, nextHeaderIndex: nextIndex } = readUntilHeaders(
			lines,
			contentStartIndex,
			CONTEXT_FILE_HEADER_PATTERN,
		)

		contextFiles.push({
			filepath: headers.filepath,
			content: fileContent,
		})

		currentIndex = nextIndex
	}

	return { mainContent, contextFiles }
}

function parseTestCaseFile(filePath: string): {
	description: string
	filename: string
	input: string
	contextFiles: ContextFile[]
} {
	const content = fs.readFileSync(filePath, "utf-8")
	const lines = content.split("\n")

	// Parse main headers (#### description:, #### filename:)
	const { headers, contentStartIndex } = parseHeaders(
		lines,
		0,
		MAIN_HEADER_PATTERN,
		["description", "filename"],
		filePath,
	)

	// Parse main content and context files
	const { mainContent, contextFiles } = parseContextFiles(lines, contentStartIndex)

	const input = mainContent.replace(/<<<CURSOR>>>/g, CURSOR_MARKER)

	return {
		description: headers.description,
		filename: headers.filename,
		input,
		contextFiles,
	}
}

function loadTestCases(): Category[] {
	if (!fs.existsSync(TEST_CASES_DIR)) {
		return []
	}

	const categories: Category[] = []
	const categoryDirs = fs.readdirSync(TEST_CASES_DIR, { withFileTypes: true })

	for (const categoryDir of categoryDirs) {
		if (!categoryDir.isDirectory()) continue

		const categoryName = categoryDir.name
		const categoryPath = path.join(TEST_CASES_DIR, categoryName)
		const testCaseFiles = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".txt"))

		const testCases: CategoryTestCase[] = []

		for (const testCaseFile of testCaseFiles) {
			const testCaseName = testCaseFile.replace(".txt", "")
			const testCasePath = path.join(categoryPath, testCaseFile)
			const { description, filename, input, contextFiles } = parseTestCaseFile(testCasePath)

			testCases.push({
				name: testCaseName,
				input,
				description,
				filename,
				contextFiles,
			})
		}

		if (testCases.length > 0) {
			categories.push({
				name: categoryName,
				testCases,
			})
		}
	}

	return categories
}

export const categories: Category[] = loadTestCases()

export const testCases: TestCase[] = categories.flatMap((category) =>
	category.testCases.map((tc) => ({
		...tc,
		category: category.name,
	})),
)

export function getTestCasesByCategory(categoryName: string): TestCase[] {
	const category = categories.find((c) => c.name === categoryName)
	return category
		? category.testCases.map((tc) => ({
				...tc,
				category: category.name,
			}))
		: []
}

export function getCategories(): string[] {
	return categories.map((c) => c.name)
}
