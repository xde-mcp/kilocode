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
	filePath: string,
	requiredHeaders: string[],
): { headers: Record<string, string>; contentStartIndex: number } {
	const headers: Record<string, string> = {}
	let contentStartIndex = 0

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		const headerMatch = line.match(/^#### ([^:]+):\s*(.*)$/)

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
		throw new Error(`Invalid test case file format: ${filePath}. Missing headers: ${missingHeaders.join(", ")}`)
	}

	return { headers, contentStartIndex }
}

function parseContextFiles(content: string): { mainContent: string; contextFiles: ContextFile[] } {
	const contextFiles: ContextFile[] = []

	// Split by #### headers to find context files
	const sections = content.split(/^#### /m)

	// First section is the main file content (before any #### headers)
	const mainContent = sections[0]

	// Remaining sections are context files
	for (let i = 1; i < sections.length; i++) {
		const section = sections[i]
		const newlineIndex = section.indexOf("\n")
		if (newlineIndex === -1) continue

		const filepath = section.substring(0, newlineIndex).trim()
		const fileContent = section.substring(newlineIndex + 1)

		if (filepath) {
			contextFiles.push({
				filepath,
				content: fileContent,
			})
		}
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

	const { headers, contentStartIndex } = parseHeaders(lines, filePath, ["description", "filename"])

	const rawContent = lines.slice(contentStartIndex).join("\n")

	// Parse context files from the content
	const { mainContent, contextFiles } = parseContextFiles(rawContent)

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
