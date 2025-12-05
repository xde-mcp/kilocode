import fs from "fs"
import path from "path"
import readline from "readline"

const APPROVALS_DIR = "approvals"

export interface ApprovalResult {
	isApproved: boolean
	newOutput: boolean
}

function getCategoryPath(category: string): string {
	return path.join(APPROVALS_DIR, category)
}

function getNextFileNumber(categoryDir: string, testName: string): number {
	if (!fs.existsSync(categoryDir)) {
		return 1
	}

	const files = fs.readdirSync(categoryDir)
	// Match both approved and rejected files to get globally unique numbers
	const pattern = new RegExp(`^${testName}\\.(approved|rejected)\\.(\\d+)\\.txt$`)
	const numbers = files
		.filter((f) => pattern.test(f))
		.map((f) => {
			const match = f.match(pattern)
			return match ? parseInt(match[2], 10) : 0
		})

	return numbers.length > 0 ? Math.max(...numbers) + 1 : 1
}

function findMatchingFile(
	categoryDir: string,
	testName: string,
	type: "approved" | "rejected",
	content: string,
): string | null {
	if (!fs.existsSync(categoryDir)) {
		return null
	}

	const pattern = new RegExp(`^${testName}\\.${type}\\.\\d+\\.txt$`)
	const files = fs.readdirSync(categoryDir).filter((f) => pattern.test(f))

	for (const file of files) {
		const filePath = path.join(categoryDir, file)
		const fileContent = fs.readFileSync(filePath, "utf-8")
		if (fileContent.trim() === content.trim()) {
			return file
		}
	}

	return null
}

async function askUserApproval(category: string, testName: string, input: string, output: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	return new Promise((resolve) => {
		console.log("\n" + "═".repeat(80))
		console.log(`\n🔍 New output detected for: ${category}/${testName}\n`)
		console.log("Input:")
		console.log("─".repeat(80))
		console.log(input)
		console.log("─".repeat(80))
		console.log("\nOutput:")
		console.log("─".repeat(80))
		console.log(output)
		console.log("─".repeat(80))
		console.log("\n" + "─".repeat(80))

		rl.question("\nIs this acceptable? [Y/n]: ", (answer) => {
			rl.close()
			const trimmed = answer.trim().toLowerCase()
			const isApproved = trimmed === "" || trimmed === "y" || trimmed === "yes"
			resolve(isApproved)
		})
	})
}

export async function checkApproval(
	category: string,
	testName: string,
	input: string,
	output: string,
	skipApproval: boolean = false,
): Promise<ApprovalResult> {
	const categoryDir = getCategoryPath(category)

	const approvedMatch = findMatchingFile(categoryDir, testName, "approved", output)
	if (approvedMatch) {
		return { isApproved: true, newOutput: false }
	}

	const rejectedMatch = findMatchingFile(categoryDir, testName, "rejected", output)
	if (rejectedMatch) {
		return { isApproved: false, newOutput: false }
	}

	// If skipApproval is true, mark as unknown (new output)
	if (skipApproval) {
		return { isApproved: false, newOutput: true }
	}

	const isApproved = await askUserApproval(category, testName, input, output)

	const type: "approved" | "rejected" = isApproved ? "approved" : "rejected"

	fs.mkdirSync(categoryDir, { recursive: true })

	const nextNumber = getNextFileNumber(categoryDir, testName)
	const filename = `${testName}.${type}.${nextNumber}.txt`
	const filePath = path.join(categoryDir, filename)

	fs.writeFileSync(filePath, output, "utf-8")

	return { isApproved, newOutput: true }
}

export interface RenumberResult {
	renamedCount: number
	totalFiles: number
}

export function renumberApprovals(approvalsDir: string = "approvals"): RenumberResult {
	let renamedCount = 0
	let totalFiles = 0

	if (!fs.existsSync(approvalsDir)) {
		return { renamedCount, totalFiles }
	}

	// Get all category directories
	const categories = fs.readdirSync(approvalsDir, { withFileTypes: true }).filter((d) => d.isDirectory())

	for (const category of categories) {
		const categoryDir = path.join(approvalsDir, category.name)
		const files = fs.readdirSync(categoryDir).filter((f) => f.endsWith(".txt"))

		// Group files by test name
		const filesByTestName = new Map<string, string[]>()
		const pattern = /^(.+)\.(approved|rejected)\.(\d+)\.txt$/

		for (const file of files) {
			const match = file.match(pattern)
			if (match) {
				totalFiles++
				const testName = match[1]
				if (!filesByTestName.has(testName)) {
					filesByTestName.set(testName, [])
				}
				filesByTestName.get(testName)!.push(file)
			}
		}

		// Renumber files for each test name
		for (const [testName, testFiles] of filesByTestName) {
			// Sort files by their current number
			const sortedFiles = testFiles.sort((a, b) => {
				const matchA = a.match(pattern)!
				const matchB = b.match(pattern)!
				return parseInt(matchA[3], 10) - parseInt(matchB[3], 10)
			})

			// Check if renumbering is needed
			const numbers = sortedFiles.map((f) => {
				const match = f.match(pattern)!
				return parseInt(match[3], 10)
			})

			// Check for duplicates or gaps
			const uniqueNumbers = new Set(numbers)
			const needsRenumber = uniqueNumbers.size !== numbers.length || !isSequential(numbers)

			if (needsRenumber) {
				// Renumber all files sequentially
				for (let i = 0; i < sortedFiles.length; i++) {
					const oldFile = sortedFiles[i]
					const match = oldFile.match(pattern)!
					const type = match[2]
					const newNumber = i + 1
					const newFile = `${testName}.${type}.${newNumber}.txt`

					if (oldFile !== newFile) {
						const oldPath = path.join(categoryDir, oldFile)
						const newPath = path.join(categoryDir, newFile)

						// Use a temp file to avoid conflicts
						const tempPath = path.join(categoryDir, `${testName}.${type}.temp_${i}.txt`)
						fs.renameSync(oldPath, tempPath)
						sortedFiles[i] = `${testName}.${type}.temp_${i}.txt`
					}
				}

				// Now rename from temp to final
				for (let i = 0; i < sortedFiles.length; i++) {
					const tempFile = sortedFiles[i]
					if (tempFile.includes(".temp_")) {
						const match = tempFile.match(/^(.+)\.(approved|rejected)\.temp_(\d+)\.txt$/)!
						const type = match[2]
						const newNumber = i + 1
						const newFile = `${testName}.${type}.${newNumber}.txt`

						const tempPath = path.join(categoryDir, tempFile)
						const newPath = path.join(categoryDir, newFile)
						fs.renameSync(tempPath, newPath)
						renamedCount++
					}
				}
			}
		}
	}

	return { renamedCount, totalFiles }
}

function isSequential(numbers: number[]): boolean {
	const sorted = [...numbers].sort((a, b) => a - b)
	for (let i = 0; i < sorted.length; i++) {
		if (sorted[i] !== i + 1) {
			return false
		}
	}
	return true
}
