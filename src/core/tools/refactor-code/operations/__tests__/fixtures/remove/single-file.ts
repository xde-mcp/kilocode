// Sample file for remove testing

// Function to be removed
function unusedFunction(param: string): string {
	return `Function result: ${param}`
}

// Function that will remain
function keepFunction() {
	return "This function should remain"
}

// Variable to be removed
const unusedVariable = "This will be removed"

// Variable to keep
const keepVariable = "This should remain"

// Class with method to be removed
class TestClass {
	// Method to be removed
	unusedMethod() {
		return "This method will be removed"
	}

	// Method to keep
	keepMethod() {
		return "This method should remain"
	}
}

// Exported symbols for testing export removal
export { unusedFunction, keepFunction, TestClass }
export const exportedUnused = "This exported variable will be removed"
