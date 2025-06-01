export interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createDefaultUser(email: string): UserData {
  return {
    id: crypto.randomUUID(),
    firstName: '',
    lastName: '',
    email,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserValidationError';
  }
}

// This will be a candidate for the "remove" operation test
export function deprecatedUserFactory() {
  console.warn('This function is deprecated. Use createDefaultUser instead.');
  return createDefaultUser('default@example.com');
}