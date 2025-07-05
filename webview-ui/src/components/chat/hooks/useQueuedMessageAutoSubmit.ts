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

		if (hasQueuedMessage && sendingDisabled) {
			inputValueAtQueueTimeRef.current = inputValue
		}

		const justBecameIdle = prevSendingDisabledRef.current === true && sendingDisabled === false

		// Update previous state for next comparison
		prevSendingDisabledRef.current = sendingDisabled

		// Only proceed if agent just became idle and we have a queued message
		if (justBecameIdle && hasQueuedMessage && queuedMessage) {
			timeoutRef.current = setTimeout(() => {
				const userTypedNewContent = inputValue !== inputValueAtQueueTimeRef.current && inputValue.trim() !== ""

				if (userTypedNewContent) {
					timeoutRef.current = null
					return
				}

				if (hasQueuedMessage && queuedMessage && !sendingDisabled) {
					onAutoSubmit(queuedMessage, queuedImages)
					clearQueuedMessage()
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
