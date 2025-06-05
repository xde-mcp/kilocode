// Large TypeScript file for performance testing - 400+ lines
// This file contains multiple functions, classes, interfaces, and complex TypeScript constructs

export interface UserProfile {
	id: string
	firstName: string
	lastName: string
	email: string
	dateOfBirth: Date
	address: Address
	preferences: UserPreferences
	metadata: Record<string, any>
}

export interface Address {
	street: string
	city: string
	state: string
	zipCode: string
	country: string
	coordinates?: GeographicCoordinates
}

export interface GeographicCoordinates {
	latitude: number
	longitude: number
	altitude?: number
}

export interface UserPreferences {
	theme: "light" | "dark" | "auto"
	language: string
	timezone: string
	notifications: NotificationSettings
	privacy: PrivacySettings
}

export interface NotificationSettings {
	email: boolean
	push: boolean
	sms: boolean
	frequency: "immediate" | "daily" | "weekly" | "never"
}

export interface PrivacySettings {
	profileVisibility: "public" | "friends" | "private"
	dataSharing: boolean
	analyticsOptOut: boolean
}

export class UserManager {
	private users: Map<string, UserProfile> = new Map()
	private readonly maxUsers: number = 10000

	constructor(private readonly databaseConnection: DatabaseConnection) {
		this.initializeUserCache()
	}

	private async initializeUserCache(): Promise<void> {
		try {
			const recentUsers = await this.databaseConnection.getRecentUsers(100)
			for (const user of recentUsers) {
				this.users.set(user.id, user)
			}
			console.log(`Initialized cache with ${recentUsers.length} users`)
		} catch (error) {
			console.error("Failed to initialize user cache:", error)
			throw new Error("User cache initialization failed")
		}
	}

	public async createUser(userData: Omit<UserProfile, "id">): Promise<UserProfile> {
		if (this.users.size >= this.maxUsers) {
			throw new Error("Maximum user limit reached")
		}

		const newUser: UserProfile = {
			id: this.generateUniqueId(),
			...userData,
		}

		try {
			await this.validateUserData(newUser)
			await this.databaseConnection.saveUser(newUser)
			this.users.set(newUser.id, newUser)

			await this.sendWelcomeNotification(newUser)
			await this.logUserCreation(newUser)

			return newUser
		} catch (error) {
			console.error("Failed to create user:", error)
			throw new Error(`User creation failed: ${error.message}`)
		}
	}

	public async getUserById(userId: string): Promise<UserProfile | null> {
		// Check cache first
		if (this.users.has(userId)) {
			return this.users.get(userId)!
		}

		try {
			const user = await this.databaseConnection.getUserById(userId)
			if (user) {
				this.users.set(userId, user)
			}
			return user
		} catch (error) {
			console.error(`Failed to get user ${userId}:`, error)
			return null
		}
	}

	public async updateUser(userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
		const existingUser = await this.getUserById(userId)
		if (!existingUser) {
			return null
		}

		const updatedUser: UserProfile = {
			...existingUser,
			...updates,
			id: existingUser.id, // Ensure ID cannot be changed
		}

		try {
			await this.validateUserData(updatedUser)
			await this.databaseConnection.updateUser(updatedUser)
			this.users.set(userId, updatedUser)

			await this.logUserUpdate(existingUser, updatedUser)

			return updatedUser
		} catch (error) {
			console.error(`Failed to update user ${userId}:`, error)
			throw new Error(`User update failed: ${error.message}`)
		}
	}

	public async deleteUser(userId: string): Promise<boolean> {
		try {
			const user = await this.getUserById(userId)
			if (!user) {
				return false
			}

			await this.databaseConnection.deleteUser(userId)
			this.users.delete(userId)

			await this.logUserDeletion(user)
			await this.cleanupUserData(userId)

			return true
		} catch (error) {
			console.error(`Failed to delete user ${userId}:`, error)
			return false
		}
	}

	private generateUniqueId(): string {
		return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}

	private async validateUserData(user: UserProfile): Promise<void> {
		if (!user.email || !this.isValidEmail(user.email)) {
			throw new Error("Invalid email address")
		}

		if (!user.firstName || user.firstName.trim().length === 0) {
			throw new Error("First name is required")
		}

		if (!user.lastName || user.lastName.trim().length === 0) {
			throw new Error("Last name is required")
		}

		if (!this.isValidAddress(user.address)) {
			throw new Error("Invalid address information")
		}

		if (await this.isEmailTaken(user.email, user.id)) {
			throw new Error("Email address is already in use")
		}
	}

	private isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		return emailRegex.test(email)
	}

	private isValidAddress(address: Address): boolean {
		return !!(address.street && address.city && address.state && address.zipCode && address.country)
	}

	private async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
		try {
			const existingUser = await this.databaseConnection.getUserByEmail(email)
			return existingUser !== null && existingUser.id !== excludeUserId
		} catch (error) {
			console.error("Failed to check email availability:", error)
			return false
		}
	}

	private async sendWelcomeNotification(user: UserProfile): Promise<void> {
		try {
			const notificationService = new NotificationService()
			await notificationService.sendWelcomeEmail(user)
		} catch (error) {
			console.warn("Failed to send welcome notification:", error)
		}
	}

	private async logUserCreation(user: UserProfile): Promise<void> {
		const auditLogger = new AuditLogger()
		await auditLogger.logEvent("USER_CREATED", {
			userId: user.id,
			email: user.email,
			timestamp: new Date().toISOString(),
		})
	}

	private async logUserUpdate(oldUser: UserProfile, newUser: UserProfile): Promise<void> {
		const auditLogger = new AuditLogger()
		const changes = this.detectUserChanges(oldUser, newUser)
		await auditLogger.logEvent("USER_UPDATED", {
			userId: newUser.id,
			changes,
			timestamp: new Date().toISOString(),
		})
	}

	private async logUserDeletion(user: UserProfile): Promise<void> {
		const auditLogger = new AuditLogger()
		await auditLogger.logEvent("USER_DELETED", {
			userId: user.id,
			email: user.email,
			timestamp: new Date().toISOString(),
		})
	}

	private detectUserChanges(oldUser: UserProfile, newUser: UserProfile): Record<string, any> {
		const changes: Record<string, any> = {}

		for (const key in newUser) {
			if (oldUser[key as keyof UserProfile] !== newUser[key as keyof UserProfile]) {
				changes[key] = {
					old: oldUser[key as keyof UserProfile],
					new: newUser[key as keyof UserProfile],
				}
			}
		}

		return changes
	}

	private async cleanupUserData(userId: string): Promise<void> {
		try {
			// Clean up user sessions
			await this.databaseConnection.deleteUserSessions(userId)

			// Clean up user files
			await this.databaseConnection.deleteUserFiles(userId)

			// Clean up user preferences
			await this.databaseConnection.deleteUserPreferences(userId)

			console.log(`Cleaned up data for user ${userId}`)
		} catch (error) {
			console.error(`Failed to cleanup data for user ${userId}:`, error)
		}
	}
}

export class NotificationService {
	private readonly emailProvider: EmailProvider
	private readonly pushProvider: PushNotificationProvider
	private readonly smsProvider: SMSProvider

	constructor() {
		this.emailProvider = new EmailProvider()
		this.pushProvider = new PushNotificationProvider()
		this.smsProvider = new SMSProvider()
	}

	public async sendWelcomeEmail(user: UserProfile): Promise<void> {
		const emailContent = this.generateWelcomeEmailContent(user)
		await this.emailProvider.sendEmail({
			to: user.email,
			subject: "Welcome to our platform!",
			content: emailContent,
			template: "welcome",
		})
	}

	public async sendPasswordResetEmail(user: UserProfile, resetToken: string): Promise<void> {
		const emailContent = this.generatePasswordResetEmailContent(user, resetToken)
		await this.emailProvider.sendEmail({
			to: user.email,
			subject: "Password Reset Request",
			content: emailContent,
			template: "password-reset",
		})
	}

	public async sendNotification(user: UserProfile, notification: NotificationPayload): Promise<void> {
		const promises: Promise<void>[] = []

		if (user.preferences.notifications.email) {
			promises.push(this.sendEmailNotification(user, notification))
		}

		if (user.preferences.notifications.push) {
			promises.push(this.sendPushNotification(user, notification))
		}

		if (user.preferences.notifications.sms) {
			promises.push(this.sendSMSNotification(user, notification))
		}

		await Promise.allSettled(promises)
	}

	private generateWelcomeEmailContent(user: UserProfile): string {
		return `
      <h1>Welcome, ${user.firstName}!</h1>
      <p>Thank you for joining our platform. We're excited to have you on board.</p>
      <p>Your account has been successfully created with the email: ${user.email}</p>
      <p>You can now start exploring all the features we have to offer.</p>
      <p>If you have any questions, feel free to contact our support team.</p>
      <p>Best regards,<br>The Platform Team</p>
    `
	}

	private generatePasswordResetEmailContent(user: UserProfile, resetToken: string): string {
		const resetUrl = `https://platform.example.com/reset-password?token=${resetToken}`
		return `
      <h1>Password Reset Request</h1>
      <p>Hello ${user.firstName},</p>
      <p>We received a request to reset your password for your account.</p>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't request this password reset, please ignore this email.</p>
      <p>Best regards,<br>The Platform Team</p>
    `
	}

	private async sendEmailNotification(user: UserProfile, notification: NotificationPayload): Promise<void> {
		await this.emailProvider.sendEmail({
			to: user.email,
			subject: notification.title,
			content: notification.body,
			template: "notification",
		})
	}

	private async sendPushNotification(user: UserProfile, notification: NotificationPayload): Promise<void> {
		await this.pushProvider.sendPushNotification({
			userId: user.id,
			title: notification.title,
			body: notification.body,
			data: notification.data,
		})
	}

	private async sendSMSNotification(user: UserProfile, notification: NotificationPayload): Promise<void> {
		// Only send SMS for high-priority notifications
		if (notification.priority === "high") {
			await this.smsProvider.sendSMS({
				phoneNumber: user.metadata.phoneNumber,
				message: `${notification.title}: ${notification.body}`,
			})
		}
	}
}

export class AuditLogger {
	private readonly logStorage: LogStorage

	constructor() {
		this.logStorage = new LogStorage()
	}

	public async logEvent(eventType: string, eventData: Record<string, any>): Promise<void> {
		const logEntry: AuditLogEntry = {
			id: this.generateLogId(),
			eventType,
			eventData,
			timestamp: new Date(),
			source: "user-management-system",
		}

		try {
			await this.logStorage.saveLogEntry(logEntry)
			console.log(`Audit log entry created: ${logEntry.id}`)
		} catch (error) {
			console.error("Failed to save audit log entry:", error)
			// Don't throw error to avoid breaking the main operation
		}
	}

	public async getAuditLogs(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
		try {
			return await this.logStorage.getLogEntries(filters)
		} catch (error) {
			console.error("Failed to retrieve audit logs:", error)
			return []
		}
	}

	private generateLogId(): string {
		return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	}
}

// Supporting interfaces and types
export interface DatabaseConnection {
	getRecentUsers(limit: number): Promise<UserProfile[]>
	getUserById(id: string): Promise<UserProfile | null>
	getUserByEmail(email: string): Promise<UserProfile | null>
	saveUser(user: UserProfile): Promise<void>
	updateUser(user: UserProfile): Promise<void>
	deleteUser(id: string): Promise<void>
	deleteUserSessions(userId: string): Promise<void>
	deleteUserFiles(userId: string): Promise<void>
	deleteUserPreferences(userId: string): Promise<void>
}

export interface EmailProvider {
	sendEmail(emailData: EmailData): Promise<void>
}

export interface PushNotificationProvider {
	sendPushNotification(pushData: PushNotificationData): Promise<void>
}

export interface SMSProvider {
	sendSMS(smsData: SMSData): Promise<void>
}

export interface LogStorage {
	saveLogEntry(entry: AuditLogEntry): Promise<void>
	getLogEntries(filters: AuditLogFilters): Promise<AuditLogEntry[]>
}

export interface EmailData {
	to: string
	subject: string
	content: string
	template: string
}

export interface PushNotificationData {
	userId: string
	title: string
	body: string
	data?: Record<string, any>
}

export interface SMSData {
	phoneNumber: string
	message: string
}

export interface NotificationPayload {
	title: string
	body: string
	priority: "low" | "medium" | "high"
	data?: Record<string, any>
}

export interface AuditLogEntry {
	id: string
	eventType: string
	eventData: Record<string, any>
	timestamp: Date
	source: string
}

export interface AuditLogFilters {
	eventType?: string
	userId?: string
	startDate?: Date
	endDate?: Date
	limit?: number
}

// Utility functions for data processing
export function formatUserDisplayName(user: UserProfile): string {
	return `${user.firstName} ${user.lastName}`.trim()
}

export function calculateUserAge(user: UserProfile): number {
	const today = new Date()
	const birthDate = new Date(user.dateOfBirth)
	let age = today.getFullYear() - birthDate.getFullYear()
	const monthDiff = today.getMonth() - birthDate.getMonth()

	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
		age--
	}

	return age
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
	const result: PasswordValidationResult = {
		isValid: true,
		score: 0,
		feedback: [],
	}

	if (password.length < 8) {
		result.isValid = false
		result.feedback.push("Password must be at least 8 characters long")
	} else {
		result.score += 1
	}

	if (!/[A-Z]/.test(password)) {
		result.isValid = false
		result.feedback.push("Password must contain at least one uppercase letter")
	} else {
		result.score += 1
	}

	if (!/[a-z]/.test(password)) {
		result.isValid = false
		result.feedback.push("Password must contain at least one lowercase letter")
	} else {
		result.score += 1
	}

	if (!/\d/.test(password)) {
		result.isValid = false
		result.feedback.push("Password must contain at least one number")
	} else {
		result.score += 1
	}

	if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
		result.feedback.push("Consider adding special characters for stronger security")
	} else {
		result.score += 1
	}

	return result
}

export interface PasswordValidationResult {
	isValid: boolean
	score: number
	feedback: string[]
}

// Export utility functions for external use
export const UserUtils = {
	formatDisplayName: formatUserDisplayName,
	calculateAge: calculateUserAge,
	validatePassword: validatePasswordStrength,
}

// Concrete implementations for the interfaces
export class EmailProviderImpl implements EmailProvider {
	async sendEmail(emailData: EmailData): Promise<void> {
		console.log(`Sending email to ${emailData.to}: ${emailData.subject}`)
		// Simulate email sending delay
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
}

export class PushNotificationProviderImpl implements PushNotificationProvider {
	async sendPushNotification(pushData: PushNotificationData): Promise<void> {
		console.log(`Sending push notification to user ${pushData.userId}: ${pushData.title}`)
		// Simulate push notification delay
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
}

export class SMSProviderImpl implements SMSProvider {
	async sendSMS(smsData: SMSData): Promise<void> {
		console.log(`Sending SMS to ${smsData.phoneNumber}: ${smsData.message}`)
		// Simulate SMS sending delay
		await new Promise((resolve) => setTimeout(resolve, 150))
	}
}

export class LogStorageImpl implements LogStorage {
	private logs: AuditLogEntry[] = []

	async saveLogEntry(entry: AuditLogEntry): Promise<void> {
		this.logs.push(entry)
		console.log(`Saved audit log entry: ${entry.id}`)
		// Simulate database write delay
		await new Promise((resolve) => setTimeout(resolve, 25))
	}

	async getLogEntries(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
		let filteredLogs = this.logs

		if (filters.eventType) {
			filteredLogs = filteredLogs.filter((log) => log.eventType === filters.eventType)
		}

		if (filters.userId) {
			filteredLogs = filteredLogs.filter((log) => log.eventData.userId === filters.userId)
		}

		if (filters.startDate) {
			filteredLogs = filteredLogs.filter((log) => log.timestamp >= filters.startDate!)
		}

		if (filters.endDate) {
			filteredLogs = filteredLogs.filter((log) => log.timestamp <= filters.endDate!)
		}

		if (filters.limit) {
			filteredLogs = filteredLogs.slice(0, filters.limit)
		}

		// Simulate database query delay
		await new Promise((resolve) => setTimeout(resolve, 75))
		return filteredLogs
	}
}

// Mock database connection implementation
export class MockDatabaseConnection implements DatabaseConnection {
	private users: UserProfile[] = []

	async getRecentUsers(limit: number): Promise<UserProfile[]> {
		await new Promise((resolve) => setTimeout(resolve, 50))
		return this.users.slice(-limit)
	}

	async getUserById(id: string): Promise<UserProfile | null> {
		await new Promise((resolve) => setTimeout(resolve, 25))
		return this.users.find((user) => user.id === id) || null
	}

	async getUserByEmail(email: string): Promise<UserProfile | null> {
		await new Promise((resolve) => setTimeout(resolve, 30))
		return this.users.find((user) => user.email === email) || null
	}

	async saveUser(user: UserProfile): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 100))
		this.users.push(user)
	}

	async updateUser(user: UserProfile): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 75))
		const index = this.users.findIndex((u) => u.id === user.id)
		if (index !== -1) {
			this.users[index] = user
		}
	}

	async deleteUser(id: string): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 50))
		this.users = this.users.filter((user) => user.id !== id)
	}

	async deleteUserSessions(userId: string): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 25))
		console.log(`Deleted sessions for user ${userId}`)
	}

	async deleteUserFiles(userId: string): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 100))
		console.log(`Deleted files for user ${userId}`)
	}

	async deleteUserPreferences(userId: string): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 25))
		console.log(`Deleted preferences for user ${userId}`)
	}
}
