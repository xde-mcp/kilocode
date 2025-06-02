// Data service functions
import { add, multiply } from "../utils/mathUtils"
import { calculateAverage } from "../../../../../../../../test-refactor-move/src/utils/mathUtils";
import { calculateTotal } from "../../../../../../../../test-refactor-move/src/utils/stringUtils";

export function processData(data: number[]): number {
	return data.reduce((sum, val) => add(sum, val), 0)
}

export function getMaxValue(data: number[]): number {
	if (data.length === 0) return -Infinity
	return Math.max(...data)
}

export function getMinValue(data: number[]): number {
	if (data.length === 0) return Infinity
	return Math.min(...data)
}