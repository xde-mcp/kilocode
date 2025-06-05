const path = require("path")

// Simulate the test's path calculation
const reExportFile = "/tmp/test/src/models/index.ts"
const targetFile = "/tmp/test/src/target/moved.ts"

console.log("=== Test's Path Calculation ===")
const relativePath = path.relative(path.dirname(reExportFile), targetFile).replace(/\\/g, "/")
console.log("Raw relative path:", relativePath)

const pathWithoutExtension = relativePath.replace(/\.ts$/, "")
console.log("Path without extension:", pathWithoutExtension)

const expectedPath = pathWithoutExtension.startsWith(".") ? pathWithoutExtension : "./" + pathWithoutExtension
console.log("Expected path:", expectedPath)

console.log("\n=== Our ImportManager's Calculation ===")
// Simulate our calculateRelativePath method
const fromPath = reExportFile
const toPath = targetFile

const normalizedFromPath = fromPath.replace(/\\/g, "/")
const normalizedToPath = toPath.replace(/\\/g, "/")

const fromDir = path.dirname(normalizedFromPath)
let ourRelativePath = path.relative(fromDir, normalizedToPath)

// Normalize the resulting path
ourRelativePath = ourRelativePath.replace(/\\/g, "/")

// Remove file extension
ourRelativePath = ourRelativePath.replace(/\.(ts|tsx|js|jsx)$/, "")

// Ensure it starts with ./ or ../
if (!ourRelativePath.startsWith(".")) {
	ourRelativePath = "./" + ourRelativePath
}

console.log("Our relative path:", ourRelativePath)

console.log("\n=== Comparison ===")
console.log("Test expects:", `export { AppSettings } from "${expectedPath}"`)
console.log("We generate:", `export { AppSettings } from "${ourRelativePath}"`)
console.log("Match:", expectedPath === ourRelativePath)
