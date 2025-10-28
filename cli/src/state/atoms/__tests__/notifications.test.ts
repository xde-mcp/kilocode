import { describe, it, expect, beforeEach } from "vitest"
import { createStore } from "jotai"
import {
	notificationsAtom,
	notificationsLoadingAtom,
	notificationsErrorAtom,
	hasNotificationsAtom,
	firstNotificationAtom,
	notificationCountAtom,
	setNotificationsAtom,
	clearNotificationsAtom,
	setNotificationsLoadingAtom,
	setNotificationsErrorAtom,
	type KilocodeNotification,
} from "../notifications.js"

describe("Notifications Atoms", () => {
	let store: ReturnType<typeof createStore>

	beforeEach(() => {
		store = createStore()
	})

	describe("notificationsAtom", () => {
		it("should initialize with empty array", () => {
			const notifications = store.get(notificationsAtom)
			expect(notifications).toEqual([])
		})

		it("should store notifications", () => {
			const mockNotifications: KilocodeNotification[] = [
				{
					id: "notif-1",
					title: "Test Notification",
					message: "This is a test",
				},
			]

			store.set(notificationsAtom, mockNotifications)
			const notifications = store.get(notificationsAtom)

			expect(notifications).toEqual(mockNotifications)
		})
	})

	describe("notificationsLoadingAtom", () => {
		it("should initialize with false", () => {
			const loading = store.get(notificationsLoadingAtom)
			expect(loading).toBe(false)
		})

		it("should update loading state", () => {
			store.set(notificationsLoadingAtom, true)
			expect(store.get(notificationsLoadingAtom)).toBe(true)

			store.set(notificationsLoadingAtom, false)
			expect(store.get(notificationsLoadingAtom)).toBe(false)
		})
	})

	describe("notificationsErrorAtom", () => {
		it("should initialize with null", () => {
			const error = store.get(notificationsErrorAtom)
			expect(error).toBeNull()
		})

		it("should store error", () => {
			const mockError = new Error("Test error")
			store.set(notificationsErrorAtom, mockError)

			const error = store.get(notificationsErrorAtom)
			expect(error).toBe(mockError)
		})
	})

	describe("hasNotificationsAtom", () => {
		it("should return false when no notifications", () => {
			const hasNotifications = store.get(hasNotificationsAtom)
			expect(hasNotifications).toBe(false)
		})

		it("should return true when notifications exist", () => {
			const mockNotifications: KilocodeNotification[] = [
				{
					id: "notif-1",
					title: "Test",
					message: "Test message",
				},
			]

			store.set(notificationsAtom, mockNotifications)
			const hasNotifications = store.get(hasNotificationsAtom)

			expect(hasNotifications).toBe(true)
		})
	})

	describe("firstNotificationAtom", () => {
		it("should return null when no notifications", () => {
			const firstNotification = store.get(firstNotificationAtom)
			expect(firstNotification).toBeNull()
		})

		it("should return first notification when notifications exist", () => {
			const mockNotifications: KilocodeNotification[] = [
				{
					id: "notif-1",
					title: "First Notification",
					message: "First message",
				},
				{
					id: "notif-2",
					title: "Second Notification",
					message: "Second message",
				},
			]

			store.set(notificationsAtom, mockNotifications)
			const firstNotification = store.get(firstNotificationAtom)

			expect(firstNotification).toEqual(mockNotifications[0])
		})
	})

	describe("notificationCountAtom", () => {
		it("should return 0 when no notifications", () => {
			const count = store.get(notificationCountAtom)
			expect(count).toBe(0)
		})

		it("should return correct count when notifications exist", () => {
			const mockNotifications: KilocodeNotification[] = [
				{
					id: "notif-1",
					title: "Test 1",
					message: "Message 1",
				},
				{
					id: "notif-2",
					title: "Test 2",
					message: "Message 2",
				},
				{
					id: "notif-3",
					title: "Test 3",
					message: "Message 3",
				},
			]

			store.set(notificationsAtom, mockNotifications)
			const count = store.get(notificationCountAtom)

			expect(count).toBe(3)
		})
	})

	describe("setNotificationsAtom", () => {
		it("should set notifications", () => {
			const mockNotifications: KilocodeNotification[] = [
				{
					id: "notif-1",
					title: "Test",
					message: "Test message",
				},
			]

			store.set(setNotificationsAtom, mockNotifications)
			const notifications = store.get(notificationsAtom)

			expect(notifications).toEqual(mockNotifications)
		})

		it("should replace existing notifications", () => {
			const initialNotifications: KilocodeNotification[] = [
				{
					id: "notif-1",
					title: "Initial",
					message: "Initial message",
				},
			]

			const newNotifications: KilocodeNotification[] = [
				{
					id: "notif-2",
					title: "New",
					message: "New message",
				},
			]

			store.set(notificationsAtom, initialNotifications)
			store.set(setNotificationsAtom, newNotifications)

			const notifications = store.get(notificationsAtom)
			expect(notifications).toEqual(newNotifications)
		})
	})

	describe("clearNotificationsAtom", () => {
		it("should clear all notifications", () => {
			const mockNotifications: KilocodeNotification[] = [
				{
					id: "notif-1",
					title: "Test",
					message: "Test message",
				},
			]

			store.set(notificationsAtom, mockNotifications)
			expect(store.get(notificationsAtom)).toHaveLength(1)

			store.set(clearNotificationsAtom)
			expect(store.get(notificationsAtom)).toEqual([])
		})
	})

	describe("setNotificationsLoadingAtom", () => {
		it("should set loading state", () => {
			store.set(setNotificationsLoadingAtom, true)
			expect(store.get(notificationsLoadingAtom)).toBe(true)

			store.set(setNotificationsLoadingAtom, false)
			expect(store.get(notificationsLoadingAtom)).toBe(false)
		})
	})

	describe("setNotificationsErrorAtom", () => {
		it("should set error", () => {
			const mockError = new Error("Test error")
			store.set(setNotificationsErrorAtom, mockError)

			const error = store.get(notificationsErrorAtom)
			expect(error).toBe(mockError)
		})

		it("should clear error when set to null", () => {
			const mockError = new Error("Test error")
			store.set(notificationsErrorAtom, mockError)
			expect(store.get(notificationsErrorAtom)).toBe(mockError)

			store.set(setNotificationsErrorAtom, null)
			expect(store.get(notificationsErrorAtom)).toBeNull()
		})
	})

	describe("Notification with action", () => {
		it("should handle notifications with actions", () => {
			const mockNotifications: KilocodeNotification[] = [
				{
					id: "notif-1",
					title: "Test Notification",
					message: "This is a test",
					action: {
						actionText: "Learn More",
						actionURL: "https://example.com",
					},
				},
			]

			store.set(notificationsAtom, mockNotifications)
			const notifications = store.get(notificationsAtom)

			expect(notifications[0].action).toEqual({
				actionText: "Learn More",
				actionURL: "https://example.com",
			})
		})
	})
})
