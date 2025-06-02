import { capitalize } from "../../../../../../../../test-refactor-move/src/utils/mathUtils";
import { calculateTotal } from "../../../../../../../../test-refactor-move/src/utils/stringUtils";

// String utility functions

export function reverse(str: string): string {
  return str.split('').reverse().join('');
}
export function calculateTotal(data: number[], factor: number): number {
	return multiply(processData(data), factor)
}