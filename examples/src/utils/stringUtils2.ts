import { UserData } from "../models/User";

export function createRandomString2(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
export function transformArray2(input: (string | number)[]): (string | number)[] {
  return input.map(item => {
    if (typeof item === 'string') {
      return item.split('').reverse().join('');
    } else if (typeof item === 'number') {
      return item * item;
    }
    return item;
  });
}