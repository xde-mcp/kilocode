import { UserData } from "../models/User";

export function processInputData2(user: UserData, data: any[]): string[] {
  const results: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (typeof item === 'string') {
      results.push(`Processing string: ${item.toUpperCase()}`);
    } else if (typeof item === 'number') {
      results.push(`Processing number: ${item * 2}`);
    } else if (typeof item === 'object' && item !== null) {
      results.push(`Processing object keys: ${Object.keys(item).join(', ')}`);
    } else {
      results.push(`Processing unknown type for item at index ${i}`);
    }
  }
  return results;
}

export function calculateComplexValue2(a: number, b: number, c: number[]): number {
  let sum = a + b;
  for (const num of c) {
    if (num > 10) {
      sum += num * 1.5;
    } else {
      sum -= num / 2;
    }
  }
  return sum * Math.random();
}
