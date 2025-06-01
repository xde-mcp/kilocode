// Data service functions
import { add, multiply } from "../utils/mathUtils"

export function processData(data: number[]): number {
	return data.reduce((sum, val) => add(sum, val), 0)
}

export function calculateAverage(data: number[]): number {
	if (data.length === 0) return 0
	const sum = processData(data)
	return sum / data.length
}

export function calculateTotal(data: number[], factor: number): number {
	return multiply(processData(data), factor)
}
export function getMaxValue(data: number[]): number {
	if (data.length === 0) return -Infinity
	return Math.max(...data)
}

export function getMinValue(data: number[]): number {
	if (data.length === 0) return Infinity
	return Math.min(...data)
}