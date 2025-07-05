import { useEffect, useRef } from "react"

interface UseQueuedMessageAutoSubmitProps {
	sendingDisabled: boolean
	hasQueuedMessage: boolean
	queuedMessage: string | null
	queuedImages: string[]
	onAutoSubmit: (message: string, images: string[]) => void
	clearQueuedMessage: () => void
	inputValue: string // Add input tracking for race condition prevention
}

/**
 * Custom hook to handle auto-submission of queued messages when agent becomes idle.
 * Monitors sendingDisabled state and triggers auto-submit with debounced timing.
 */
export function useQueuedMessageAutoSubmit({
	sendingDisabled,
	hasQueuedMessage,
	queuedMessage,
	queuedImages,
	onAutoSubmit,
	clearQueuedMessage,
	inputValue,
}: UseQueuedMessageAutoSubmitProps) {
	const timeoutRef = useRef<NodeJS.Timeout | null>(null)
	const prevSendingDisabledRef = useRef(sendingDisabled)
	const inputValueAtQueueTimeRef = useRef<string>("")

	useEffect(() => {
		// Clear any existing timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
			timeoutRef.current = null
		}

		// Track input value when queue is created to detect user typing during auto-submit wait
		if (hasQueuedMessage && sendingDisabled) {
			inputValueAtQueueTimeRef.current = inputValue
			console.log("🔄 Queue created - tracking input state for race condition detection")
		}

		// 🔄 Debug: State change monitoring
		console.log("🔄 Queue auto-submit state:", {
			sendingDisabled,
			hasQueuedMessage,
			queuedMessage: queuedMessage ? `"${queuedMessage.slice(0, 20)}..."` : null,
			queuedImagesCount: queuedImages.length,
			inputValue: `"${inputValue.slice(0, 20)}..."`,
			inputAtQueueTime: `"${inputValueAtQueueTimeRef.current.slice(0, 20)}..."`,
		})

		// Check if agent just became idle (sendingDisabled changed from true to false)
		const justBecameIdle = prevSendingDisabledRef.current === true && sendingDisabled === false

		// ⏱️ Debug: Idle detection
		if (justBecameIdle) {
			console.log("⏱️ Agent became idle, checking for queued message...")
		}

		// Update previous state for next comparison
		prevSendingDisabledRef.current = sendingDisabled

		// Only proceed if agent just became idle and we have a queued message
		if (justBecameIdle && hasQueuedMessage && queuedMessage) {
			// ⏱️ Debug: Starting debounce timer
			console.log("⏱️ Starting 500ms debounce timer for auto-submit...")
			console.log(
				`⏱️ Input state check: Queue-time="${inputValueAtQueueTimeRef.current}" Current="${inputValue}"`,
			)

			// Set debounced timeout for auto-submit (500ms after agent becomes idle)
			timeoutRef.current = setTimeout(() => {
				// Enhanced safety check: prevent auto-submit if user has typed new content
				const userTypedNewContent = inputValue !== inputValueAtQueueTimeRef.current && inputValue.trim() !== ""

				if (userTypedNewContent) {
					console.log("🚨 Race condition detected: User typed new content during auto-submit wait")
					console.log(`🚨 Queue-time input: "${inputValueAtQueueTimeRef.current}"`)
					console.log(`🚨 Current input: "${inputValue}"`)
					console.log("🚨 Auto-submit cancelled to prevent race condition")
					timeoutRef.current = null
					return
				}

				// Double-check conditions are still valid
				if (hasQueuedMessage && queuedMessage && !sendingDisabled) {
					// 🚀 Debug: Auto-submit execution
					console.log("🚀 Auto-submitting queued message:", {
						message: `"${queuedMessage.slice(0, 50)}..."`,
						imagesCount: queuedImages.length,
					})

					// Trigger auto-submit
					onAutoSubmit(queuedMessage, queuedImages)

					// Clear the queued message
					clearQueuedMessage()
				} else {
					// ⏱️ Debug: Conditions changed, canceling auto-submit
					console.log("⏱️ Conditions changed during debounce, canceling auto-submit")
				}

				timeoutRef.current = null
			}, 500)
		}

		// Cleanup function
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
				timeoutRef.current = null
			}
		}
	}, [sendingDisabled, hasQueuedMessage, queuedMessage, queuedImages, onAutoSubmit, clearQueuedMessage, inputValue])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [])
}
