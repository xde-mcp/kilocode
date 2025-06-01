"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserValidationError = void 0;
exports.createDefaultUser = createDefaultUser;
exports.deprecatedUserFactory = deprecatedUserFactory;
function createDefaultUser(email) {
    return {
        id: crypto.randomUUID(),
        firstName: '',
        lastName: '',
        email,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}
class UserValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UserValidationError';
    }
}
exports.UserValidationError = UserValidationError;
// This will be a candidate for the "remove" operation test
function deprecatedUserFactory() {
    console.warn('This function is deprecated. Use createDefaultUser instead.');
    return createDefaultUser('default@example.com');
}
