import { UserProfile } from "../models/User";
// This file will contain validation functions
export function validateUser(user: UserProfile): boolean {
  if (!user.email || !user.email.includes("@")) {
    return false;
  }
  return true;
}
