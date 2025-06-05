/**
 * TEST FIXTURE - DO NOT MODIFY
 *
 * This file is used as a fixture for move operation testing.
 * ⚠️ WARNING: DO NOT ADD ANY IMPORTS to this file.
 * Imports added by tests will cause build errors as they reference temporary directories.
 * The file must be kept clean for builds to succeed.
 */

// Sample file for move operation testing

// Function to be moved to another file
export function moveableFunction(param: string): string {
	return `Function result: ${param}`
}

// Function that uses the moveable function
export function functionThatUsesMoveable(): string {
	return `Using moveable: ${moveableFunction("test")}`
}

// Class to be moved to another file
export class MoveableClass {
	property: string

	constructor(value: string) {
		this.property = value
	}

	method(): string {
		return `Class method: ${this.property}`
	}
}

// Variable to be moved
export const moveableVariable = "This will be moved"

// Using the class
export function useClass(): string {
	const instance = new MoveableClass("instance value")
	return instance.method()
}

// Type to be moved
export type MoveableType = {
	id: number
	name: string
}

// Function using the type
export function useType(param: MoveableType): string {
	return `Type used: ${param.name} (${param.id})`
}
