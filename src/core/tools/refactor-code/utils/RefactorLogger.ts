import * as vscode from "vscode"

/**
 * Dedicated logger for RefactorCodeTool operations
 * Creates a separate VS Code output channel for easy filtering and debugging
 */
export class RefactorLogger {
	private static instance: RefactorLogger
	private outputChannel: vscode.OutputChannel
	private isEnabled: boolean = true

	private constructor() {
		// Handle test environment where vscode API is not available
		try {
			this.outputChannel = vscode.window.createOutputChannel("🔧 RefactorCodeTool")
		} catch (error) {
			// In test environment, create a mock output channel
			this.outputChannel = {
				appendLine: (message: string) => {
					if (process.env.NODE_ENV === "test") {
						// In test mode, optionally log to console for debugging
						// console.log(`[RefactorLogger] ${message}`);
					}
				},
				show: () => {},
				clear: () => {},
				dispose: () => {},
			} as any
		}
	}

	public static getInstance(): RefactorLogger {
		if (!RefactorLogger.instance) {
			RefactorLogger.instance = new RefactorLogger()
		}
		return RefactorLogger.instance
	}

	/**
	 * Enable or disable logging
	 */
	public setEnabled(enabled: boolean): void {
		this.isEnabled = enabled
	}

	/**
	 * Log an info message
	 */
	public info(message: string, data?: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		const logMessage = data
			? `[${timestamp}] ℹ️ ${message} | Data: ${JSON.stringify(data, null, 2)}`
			: `[${timestamp}] ℹ️ ${message}`

		this.outputChannel.appendLine(logMessage)
	}

	/**
	 * Log a warning message
	 */
	public warn(message: string, data?: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		const logMessage = data
			? `[${timestamp}] ⚠️ ${message} | Data: ${JSON.stringify(data, null, 2)}`
			: `[${timestamp}] ⚠️ ${message}`

		this.outputChannel.appendLine(logMessage)
	}

	/**
	 * Log an error message
	 */
	public error(message: string, error?: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		let logMessage = `[${timestamp}] ❌ ${message}`

		if (error) {
			if (error instanceof Error) {
				logMessage += ` | Error: ${error.message}`
				if (error.stack) {
					logMessage += `\nStack: ${error.stack}`
				}
			} else {
				logMessage += ` | Error: ${JSON.stringify(error, null, 2)}`
			}
		}

		this.outputChannel.appendLine(logMessage)
	}

	/**
	 * Log a debug message (only in development)
	 */
	public debug(message: string, data?: any): void {
		if (!this.isEnabled) return

		// Only log debug messages in development
		if (process.env.NODE_ENV !== "development") return

		const timestamp = new Date().toISOString()
		const logMessage = data
			? `[${timestamp}] 🐛 ${message} | Data: ${JSON.stringify(data, null, 2)}`
			: `[${timestamp}] 🐛 ${message}`

		this.outputChannel.appendLine(logMessage)
	}

	/**
	 * Log operation start
	 */
	public operationStart(operation: string, details?: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		const logMessage = details
			? `[${timestamp}] 🚀 OPERATION START: ${operation} | Details: ${JSON.stringify(details, null, 2)}`
			: `[${timestamp}] 🚀 OPERATION START: ${operation}`

		this.outputChannel.appendLine(logMessage)
		this.outputChannel.appendLine("─".repeat(80))
	}

	/**
	 * Log operation success
	 */
	public operationSuccess(operation: string, result?: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		const logMessage = result
			? `[${timestamp}] ✅ OPERATION SUCCESS: ${operation} | Result: ${JSON.stringify(result, null, 2)}`
			: `[${timestamp}] ✅ OPERATION SUCCESS: ${operation}`

		this.outputChannel.appendLine("─".repeat(80))
		this.outputChannel.appendLine(logMessage)
		this.outputChannel.appendLine("")
	}

	/**
	 * Log operation failure
	 */
	public operationFailure(operation: string, error: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		let logMessage = `[${timestamp}] ❌ OPERATION FAILED: ${operation}`

		if (error instanceof Error) {
			logMessage += ` | Error: ${error.message}`
			if (error.stack) {
				logMessage += `\nStack: ${error.stack}`
			}
		} else {
			logMessage += ` | Error: ${JSON.stringify(error, null, 2)}`
		}

		this.outputChannel.appendLine("─".repeat(80))
		this.outputChannel.appendLine(logMessage)
		this.outputChannel.appendLine("")
	}

	/**
	 * Log validation step
	 */
	public validation(step: string, result: boolean, details?: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		const icon = result ? "✅" : "❌"
		const status = result ? "PASSED" : "FAILED"

		const logMessage = details
			? `[${timestamp}] ${icon} VALIDATION ${status}: ${step} | Details: ${JSON.stringify(details, null, 2)}`
			: `[${timestamp}] ${icon} VALIDATION ${status}: ${step}`

		this.outputChannel.appendLine(logMessage)
	}

	/**
	 * Log execution step
	 */
	public execution(step: string, details?: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		const logMessage = details
			? `[${timestamp}] ⚙️ EXECUTION: ${step} | Details: ${JSON.stringify(details, null, 2)}`
			: `[${timestamp}] ⚙️ EXECUTION: ${step}`

		this.outputChannel.appendLine(logMessage)
	}

	/**
	 * Log verification step
	 */
	public verification(step: string, result: boolean, details?: any): void {
		if (!this.isEnabled) return

		const timestamp = new Date().toISOString()
		const icon = result ? "✅" : "❌"
		const status = result ? "PASSED" : "FAILED"

		const logMessage = details
			? `[${timestamp}] ${icon} VERIFICATION ${status}: ${step} | Details: ${JSON.stringify(details, null, 2)}`
			: `[${timestamp}] ${icon} VERIFICATION ${status}: ${step}`

		this.outputChannel.appendLine(logMessage)
	}

	/**
	 * Show the output channel
	 */
	public show(): void {
		this.outputChannel.show()
	}

	/**
	 * Clear the output channel
	 */
	public clear(): void {
		this.outputChannel.clear()
	}

	/**
	 * Dispose of the output channel
	 */
	public dispose(): void {
		this.outputChannel.dispose()
	}
}

// Export a singleton instance for easy access
export const refactorLogger = RefactorLogger.getInstance()
