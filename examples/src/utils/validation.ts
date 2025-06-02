// This file will be used for validation functions
// This will be moved to validation.ts in test case 2
export function validateUser(user: User): boolean {
  if (!user.email || !user.email.includes("@")) {
    return false;
  }
  return true;
}

export { validateUser };
