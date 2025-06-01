import { getDisplayName } from "./utils/formatting";
import { processInputData2 } from "./utils/dataProcessing2";
import { createRandomString2 } from "./utils/stringUtils2";





export function checkStatus2(status: 'active' | 'inactive' | 'pending'): boolean {
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

export function processConfiguration2(config: { [key: string]: any }): string {
  let summary = 'Configuration Summary:\n';
  for (const key in config) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      const value = config[key];
      summary += `- ${key}: ${JSON.stringify(value)}\n`;
    }
  }
  return summary;
}

export function filterAndSortNumbers2(numbers: number[], threshold: number): number[] {
  const filtered = numbers.filter(num => num > threshold);
  return filtered.sort((a, b) => a - b);
}

export function createGreeting2(name: string, language: 'en' | 'es' | 'fr' = 'en'): string {
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

export function processNestedObject2(obj: any): string[] {
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

export function performAsyncOperation2(delay: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Operation completed after ${delay}ms`);
    }, delay);
  });
}