import { UserData } from "./models/User";
import { getDisplayName } from "./utils/formatting";

export function processUserData(user: UserData, data: any[]): string[] {
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

export function calculateComplexValue(a: number, b: number, c: number[]): number {
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

export function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function transformArray(input: (string | number)[]): (string | number)[] {
  return input.map(item => {
    if (typeof item === 'string') {
      return item.split('').reverse().join('');
    } else if (typeof item === 'number') {
      return item * item;
    }
    return item;
  });
}

export function checkStatus(status: 'active' | 'inactive' | 'pending'): boolean {
  switch (status) {
    case 'active':
      return true;
    case 'inactive':
      return false;
    case 'pending':
      return false; // Or maybe true depending on logic
    default:
      return false;
  }
}

export function processConfiguration(config: { [key: string]: any }): string {
  let summary = 'Configuration Summary:\n';
  for (const key in config) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      const value = config[key];
      summary += `- ${key}: ${JSON.stringify(value)}\n`;
    }
  }
  return summary;
}

export function filterAndSortNumbers(numbers: number[], threshold: number): number[] {
  const filtered = numbers.filter(num => num > threshold);
  return filtered.sort((a, b) => a - b);
}

export function createGreeting(name: string, language: 'en' | 'es' | 'fr' = 'en'): string {
  switch (language) {
    case 'en':
      return `Hello, ${name}!`;
    case 'es':
      return `¡Hola, ${name}!`;
    case 'fr':
      return `Bonjour, ${name}!`;
    default:
      return `Hello, ${name}!`;
  }
}

export function processNestedObject(obj: any): string[] {
  const results: string[] = [];
  function traverse(current: any, path: string) {
    if (typeof current === 'object' && current !== null) {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          const newPath = path ? `${path}.${key}` : key;
          results.push(`Key: ${newPath}, Type: ${typeof current[key]}`);
          traverse(current[key], newPath);
        }
      }
    } else {
      results.push(`Value at ${path}: ${current}`);
    }
  }
  traverse(obj, '');
  return results;
}

export function performAsyncOperation(delay: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Operation completed after ${delay}ms`);
    }, delay);
  });
}