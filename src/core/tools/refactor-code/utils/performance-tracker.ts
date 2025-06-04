import { performance } from "perf_hooks"

/**
 * Simple utility to track performance of operations in the refactor tool.
 * This helps identify slow operations that might cause test timeouts.
 */
export class PerformanceTracker {
	private static timers: Record<string, { start: number; operations: Array<{ name: string; duration: number }> }> = {}
	private static enabled = process.env.NODE_ENV === "test"

	/**
	 * Start tracking performance for a specific operation
	 *
	 * @param operationId - Unique identifier for this tracking session
	 */
	static startTracking(operationId: string): void {
		if (!this.enabled) return
		this.timers[operationId] = {
			start: performance.now(),
			operations: [],
		}
		// Only log start for critical operations
		if (operationId.includes("move-") || operationId.includes("batch-")) {
			console.log(`[PERF] Started tracking: ${operationId}`)
		}
	}

	/**
	 * Record the duration of a specific step in an operation
	 *
	 * @param operationId - The operation being tracked
	 * @param stepName - Name of the step being measured
	 * @param fn - Function to execute and measure
	 * @returns The result of the function execution
	 */
	static async measureStep<T>(operationId: string, stepName: string, fn: () => Promise<T> | T): Promise<T> {
		if (!this.enabled) return fn()

		const startTime = performance.now()
		try {
			const result = await fn()
			const duration = performance.now() - startTime

			if (this.timers[operationId]) {
				this.timers[operationId].operations.push({ name: stepName, duration })
				// Only log slow steps (>100ms)
				if (duration > 100) {
					console.log(`[PERF] Slow step '${stepName}' took ${duration.toFixed(2)}ms`)
				}
			}

			return result
		} catch (error) {
			const duration = performance.now() - startTime
			console.log(`[PERF] Step '${stepName}' failed after ${duration.toFixed(2)}ms: ${error}`)
			throw error
		}
	}

	/**
	 * End tracking and report results
	 *
	 * @param operationId - The operation to finish tracking
	 * @returns Summary of operation timing
	 */
	static endTracking(operationId: string): {
		totalDuration: number
		steps: Array<{ name: string; duration: number; percentage: number }>
	} {
		if (!this.enabled || !this.timers[operationId]) {
			return { totalDuration: 0, steps: [] }
		}

		const timer = this.timers[operationId]
		const totalDuration = performance.now() - timer.start

		const steps = timer.operations.map((op) => ({
			name: op.name,
			duration: op.duration,
			percentage: (op.duration / totalDuration) * 100,
		}))

		// Only log if operation took more than 500ms
		if (totalDuration > 500) {
			console.log(`[PERF] Slow operation '${operationId}' completed in ${totalDuration.toFixed(2)}ms`)
			console.log("[PERF] Breakdown:")
			steps.forEach((step) => {
				if (step.duration > 50) {
					// Only show steps >50ms
					console.log(
						`[PERF]   - ${step.name}: ${step.duration.toFixed(2)}ms (${step.percentage.toFixed(1)}%)`,
					)
				}
			})
		}

		delete this.timers[operationId]
		return { totalDuration, steps }
	}
}
