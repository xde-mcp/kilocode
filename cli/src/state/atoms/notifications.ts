import { atom } from "jotai"
import { logs } from "../../services/logs.js"

/**
 * Notification type matching the backend API response
 */
export interface KilocodeNotification {
	id: string
	title: string
	message: string
	action?: {
		actionText: string
		actionURL: string
	}
}

/**
 * Core notifications atom - holds the list of notifications
 */
export const notificationsAtom = atom<KilocodeNotification[]>([])

/**
 * Loading state atom for notification fetching
 */
export const notificationsLoadingAtom = atom<boolean>(false)

/**
 * Error state atom for notification fetching
 */
export const notificationsErrorAtom = atom<Error | null>(null)

/**
 * Derived atom to check if there are any notifications
 */
export const hasNotificationsAtom = atom((get) => {
	const notifications = get(notificationsAtom)
	return notifications.length > 0
})

/**
 * Derived atom to get the first notification (the one to display)
 */
export const firstNotificationAtom = atom((get) => {
	const notifications = get(notificationsAtom)
	return notifications.length > 0 ? notifications[0] : null
})

/**
 * Derived atom to get the count of notifications
 */
export const notificationCountAtom = atom((get) => {
	const notifications = get(notificationsAtom)
	return notifications.length
})

/**
 * Action atom to set notifications
 */
export const setNotificationsAtom = atom(null, (get, set, notifications: KilocodeNotification[]) => {
	set(notificationsAtom, notifications)
	logs.debug(`Notifications updated: ${notifications.length} notification(s)`, "NotificationsAtoms")
})

/**
 * Action atom to clear all notifications
 */
export const clearNotificationsAtom = atom(null, (get, set) => {
	set(notificationsAtom, [])
	logs.debug("Notifications cleared", "NotificationsAtoms")
})

/**
 * Action atom to set loading state
 */
export const setNotificationsLoadingAtom = atom(null, (get, set, loading: boolean) => {
	set(notificationsLoadingAtom, loading)
})

/**
 * Action atom to set error state
 */
export const setNotificationsErrorAtom = atom(null, (get, set, error: Error | null) => {
	set(notificationsErrorAtom, error)
	if (error) {
		logs.error("Notification error", "NotificationsAtoms", { error: error.message })
	}
})
