"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatUserName = formatUserName;
exports.formatEmail = formatEmail;
exports.formatDate = formatDate;
exports.deprecatedHelper = deprecatedHelper;
exports.formatUserSummary = formatUserSummary;
// This will be renamed in test case 1
function formatUserName(user) {
    return `${user.firstName} ${user.lastName}`.trim() || "Unnamed User";
}
function formatEmail(email) {
    const [username, domain] = email.split("@");
    if (!domain)
        return email;
    return `${username.substring(0, 3)}...@${domain}`;
}
// This will be used for the date formatting rename test
function formatDate(date) {
    return date.toLocaleDateString();
}
// This will be removed in test case 3
function deprecatedHelper(value) {
    return value.toLowerCase();
}
function formatUserSummary(user) {
    return `${formatUserName(user)} (${formatEmail(user.email)})`;
}
