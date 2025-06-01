"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUser = validateUser;
exports.getUserData = getUserData;
exports.updateUserProfile = updateUserProfile;
exports.formatUserProfile = formatUserProfile;
const User_1 = require("../models/User");
const formatting_1 = require("../utils/formatting");
// This will be moved to validation.ts in test case 2
function validateUser(user) {
    if (!user.email || !user.email.includes("@")) {
        return false;
    }
    return true;
}
function getUserData(userId) {
    // Mock implementation
    return Promise.resolve((0, User_1.createDefaultUser)(`user-${userId}@example.com`));
}
function updateUserProfile(user, data) {
    return Object.assign(Object.assign(Object.assign({}, user), data), { updatedAt: new Date() });
}
function formatUserProfile(user) {
    return `
    Name: ${(0, formatting_1.formatUserName)(user)}
    Email: ${(0, formatting_1.formatEmail)(user.email)}
    Member since: ${user.createdAt.toLocaleDateString()}
  `;
}
