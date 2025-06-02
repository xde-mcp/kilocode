import { capitalize, calculateAverage } from "../../../../../../../../test-refactor-move/src/utils/mathUtils";

// Math utility functions

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
// String utility functions
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { capitalize };
export function calculateAverage(data: number[]): number {
	if (data.length === 0) return 0
	const sum = processData(data)
	return sum / data.length
}
