// Target file for move operation testing

// Existing function in the target file
export function existingFunction(value: number): number {
	return value * 2
}

// Existing class in the target file
export class ExistingClass {
	value: number

	constructor(value: number) {
		this.value = value
	}

	calculate(): number {
		return this.value * 3
	}
}

// Existing type in the target file
export type ExistingType = {
	value: number
	isValid: boolean
}

// Existing variable
export const existingVariable = "I already exist in this file"

// This function imports external dependencies
export function useExternalDep(): void {
	console.log("Using external dependency")
}
