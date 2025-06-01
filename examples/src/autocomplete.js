"use strict";
/**
 * Manages user-related operations.
 */
class UserManager {
    constructor(initialUsers = []) {
        this.users = [];
        this.users = initialUsers;
    }
    /**
     * Adds a new user to the system.
     * @param user The user object to add.
     */
    addUser(user) {
        if (this.findUserById(user.id)) {
            throw new Error(`User with ID ${user.id} already exists.`);
        }
        this.users.push(user);
        console.log(`User ${user.firstName} ${user.lastName} added.`);
    }
    /**
     * Finds a user by their ID.
     * @param userId The ID of the user to find.
     * @returns The user object if found, otherwise undefined.
     */
    findUserById(userId) {
        return this.users.find((user) => user.id === userId);
    }
    /**
     * Retrieves all active users.
     * @returns An array of active user objects.
     */
    getUsers() {
        return this.users;
    }
    /**
     * Updates an existing user's information.
     * @param updatedUser The user object with updated information.
     */
    updateUser(updatedUser) {
        const index = this.users.findIndex((user) => user.id === updatedUser.id);
        if (index === -1) {
            throw new Error(`User with ID ${updatedUser.id} not found.`);
        }
        this.users[index] = updatedUser;
        console.log(`User with ID ${updatedUser.id} updated.`);
    }
    /**
     * Deletes a user by their ID.
     * @param userId The ID of the user to delete.
     */
    deleteUser(userId) {
        const initialLength = this.users.length;
        this.users = this.users.filter((user) => user.id !== userId);
        if (this.users.length === initialLength) {
            throw new Error(`User with ID ${userId} not found.`);
        }
        console.log(`User with ID ${userId} deleted.`);
    }
}
// Example Usage:
const userManager = new UserManager();
const user1 = {
    id: 1,
    firstName: "Alice",
    lastName: "Smith",
    email: "alice.smith@example.com",
    isActive: true,
};
const user2 = {
    id: 2,
    firstName: "Bob",
    lastName: "Johnson",
    email: "bob.johnson@example.com",
    isActive: false,
};
userManager.addUser(user1);
userManager.addUser(user2);
console.log("All users:", userManager.getUsers());
const foundUser = userManager.findUserById(1);
if (foundUser) {
    console.log("Found user:", foundUser.firstName);
}
const updatedUser1 = Object.assign(Object.assign({}, user1), { isActive: false });
userManager.updateUser(updatedUser1);
userManager.deleteUser(2);
console.log("Users after operations:", userManager.getUsers());
