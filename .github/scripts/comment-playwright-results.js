const fs = require("fs")
const path = require("path")

/**
 * Posts or updates Playwright E2E test results as a PR comment
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub Actions context
 */
async function commentPlaywrightResults(github, context) {
	// Unique identifier for our comment
	const commentIdentifier = "<!-- playwright-e2e-results -->"
	let comment = `${commentIdentifier}\n## 🎭 Playwright E2E Test Results\n\n`

	const testResultsDir = "apps/playwright-e2e/test-results"
	const reportDir = "apps/playwright-e2e/playwright-report"

	if (fs.existsSync(testResultsDir) && fs.readdirSync(testResultsDir).length > 0) {
		// Check for test failures with better error handling
		let hasFailures = false
		try {
			function scanDirectory(dir) {
				const items = fs.readdirSync(dir, { withFileTypes: true })
				for (const item of items) {
					const fullPath = path.join(dir, item.name)
					if (item.isDirectory()) {
						try {
							scanDirectory(fullPath)
						} catch (e) {
							// Skip directories we can't access
							console.log(`Skipping directory ${fullPath}: ${e.message}`)
						}
					} else if (item.isFile() && item.name.endsWith(".json")) {
						try {
							const content = fs.readFileSync(fullPath, "utf8")
							if (content.includes('"status":"failed"')) {
								hasFailures = true
								return
							}
						} catch (e) {
							// Skip files we can't read
							console.log(`Skipping file ${fullPath}: ${e.message}`)
						}
					}
				}
			}
			scanDirectory(testResultsDir)
		} catch (e) {
			console.log("Error checking test results:", e.message)
		}

		if (hasFailures) {
			comment += "❌ **Some E2E tests failed**\n\n"
			comment += `- Check the [test results artifact](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}) for details\n`
			comment += `- Review the [HTML report artifact](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}) for visual debugging\n`
		} else {
			comment += "✅ **All E2E tests passed successfully!**\n\n"
			comment += "The extension works correctly in a Docker environment with full end-to-end functionality.\n"
		}
	} else {
		comment += "⚠️ **No test results found**\n\n"
		comment += `The E2E tests may not have run properly. Check the [workflow logs](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}) for details.\n`
	}

	comment += "\n---\n"
	comment += `*Workflow: [${context.workflow}](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}) • Updated: ${new Date().toISOString()}*`

	// Find existing comment with our identifier
	const { data: comments } = await github.rest.issues.listComments({
		issue_number: context.issue.number,
		owner: context.repo.owner,
		repo: context.repo.repo,
	})

	const existingComment = comments.find((comment) => comment.body.includes(commentIdentifier))

	if (existingComment) {
		// Update existing comment
		await github.rest.issues.updateComment({
			comment_id: existingComment.id,
			owner: context.repo.owner,
			repo: context.repo.repo,
			body: comment,
		})
		console.log("Updated existing Playwright E2E comment")
	} else {
		// Create new comment
		await github.rest.issues.createComment({
			issue_number: context.issue.number,
			owner: context.repo.owner,
			repo: context.repo.repo,
			body: comment,
		})
		console.log("Created new Playwright E2E comment")
	}
}

module.exports = { commentPlaywrightResults }
