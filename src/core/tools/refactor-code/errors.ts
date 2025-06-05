/**
 * Base error class for refactoring operations.
 * Provides consistent error handling across components.
 */
export class RefactorError extends Error {
	/** Paths to files affected by the error */
	public affectedFiles: string[]
	/** Optional details for debugging */
	public details?: Record<string, any>

	constructor(message: string, affectedFiles: string[] = [], details?: Record<string, any>) {
		super(message)
		this.name = this.constructor.name
		this.affectedFiles = affectedFiles
		this.details = details
	}

	/**
	 * Creates a user-friendly error message with contextual information
	 */
	public toUserFriendlyMessage(): string {
		return this.message
	}
}

/**
 * Validation-specific errors for parameter validation, file access, etc.
 */
export class ValidationError extends RefactorError {
	constructor(message: string, affectedFiles: string[] = [], details?: Record<string, any>) {
		super(`Validation failed: ${message}`, affectedFiles, details)
	}
}

/**
 * Specific validation error for file not found cases
 */
export class FileNotFoundError extends ValidationError {
	constructor(filePath: string, details?: Record<string, any>) {
		super(`File not found: ${filePath}`, [filePath], details)
	}
}

/**
 * Specific validation error for symbol not found cases
 */
export class SymbolNotFoundError extends ValidationError {
	constructor(symbolName: string, filePath: string, details?: Record<string, any>) {
		super(`Symbol '${symbolName}' not found in ${filePath}`, [filePath], {
			symbolName,
			...details,
		})
	}
}

/**
 * Specific validation error for file permission issues
 */
export class FilePermissionError extends ValidationError {
	constructor(filePath: string, details?: Record<string, any>) {
		super(
			`Permission denied when accessing ${filePath}. Check if you have the necessary permissions.`,
			[filePath],
			details,
		)
	}
}

/**
 * Specific validation error for invalid file or path formats
 */
export class InvalidPathError extends ValidationError {
	constructor(path: string, reason: string, details?: Record<string, any>) {
		super(`Invalid path: ${path} - ${reason}`, [path], details)
	}
}

/**
 * Specific validation error for symbol conflicts
 */
export class SymbolConflictError extends RefactorError {
	constructor(symbolName: string, filePath: string, details?: Record<string, any>) {
		super(`Naming conflict: Symbol '${symbolName}' already exists in ${filePath}`, [filePath], {
			symbolName,
			...details,
		})
	}
}

/**
 * Execution-specific errors during the actual operation
 */
export class ExecutionError extends RefactorError {
	constructor(message: string, affectedFiles: string[] = [], details?: Record<string, any>) {
		super(`Execution failed: ${message}`, affectedFiles, details)
	}
}

/**
 * Specific execution error for symbol extraction failures
 */
export class SymbolExtractionError extends ExecutionError {
	constructor(symbolName: string, filePath: string, details?: Record<string, any>) {
		super(`Failed to extract symbol '${symbolName}' from ${filePath}`, [filePath], { symbolName, ...details })
	}
}

/**
 * Specific execution error for target file modification failures
 */
export class TargetFileModificationError extends ExecutionError {
	constructor(filePath: string, reason: string, details?: Record<string, any>) {
		super(`Failed to modify target file ${filePath}: ${reason}`, [filePath], details)
	}
}

/**
 * Specific execution error for source file modification failures
 */
export class SourceFileModificationError extends ExecutionError {
	constructor(filePath: string, reason: string, details?: Record<string, any>) {
		super(`Failed to modify source file ${filePath}: ${reason}`, [filePath], details)
	}
}

/**
 * Specific execution error for import update failures
 */
export class ImportUpdateError extends ExecutionError {
	constructor(filePath: string, details?: Record<string, any>) {
		super(`Failed to update imports in ${filePath}`, [filePath], details)
	}
}

/**
 * Verification-specific errors for post-operation verification
 */
export class VerificationError extends RefactorError {
	/** List of specific verification failures */
	public failures: string[]

	constructor(message: string, failures: string[] = [], affectedFiles: string[] = [], details?: Record<string, any>) {
		super(`Verification failed: ${message}`, affectedFiles, details)
		this.failures = failures
	}

	/**
	 * Creates a detailed error message for debugging
	 */
	public toDetailedMessage(): string {
		return `${this.message}\n\nFailures:\n${this.failures.map((f) => `- ${f}`).join("\n")}`
	}
}

/**
 * Specific verification error when symbol was not properly added to target
 */
export class SymbolNotAddedError extends VerificationError {
	constructor(symbolName: string, filePath: string, details?: Record<string, any>) {
		super(
			`Symbol '${symbolName}' was not added to target file ${filePath}`,
			[`Symbol ${symbolName} was not found in target file`],
			[filePath],
			{ symbolName, ...details },
		)
	}
}

/**
 * Specific verification error when symbol was not properly removed from source
 */
export class SymbolNotRemovedError extends VerificationError {
	constructor(symbolName: string, filePath: string, details?: Record<string, any>) {
		super(
			`Symbol '${symbolName}' was not removed from source file ${filePath}`,
			[`Symbol ${symbolName} still exists in source file`],
			[filePath],
			{ symbolName, ...details },
		)
	}
}

/**
 * Engine-specific error for RefactorEngine operations
 */
export class RefactorEngineError extends RefactorError {
	constructor(
		message: string,
		public operation?: any,
		public override cause?: Error,
		affectedFiles: string[] = [],
		details?: Record<string, any>,
	) {
		super(message, affectedFiles, details)
		this.name = "RefactorEngineError"
	}
}

/**
 * Validation-specific error for RefactorEngine validation operations
 */
export class RefactorValidationError extends RefactorEngineError {
	public validationErrors: string[]

	constructor(
		message: string,
		operation?: any,
		validationErrors: string[] = [],
		affectedFiles: string[] = [],
		details?: Record<string, any>,
	) {
		super(message, operation, undefined, affectedFiles, details)
		this.name = "RefactorValidationError"
		this.validationErrors = validationErrors
	}
}

/**
 * Execution-specific error for RefactorEngine execution operations
 */
export class RefactorExecutionError extends RefactorEngineError {
	constructor(
		message: string,
		operation?: any,
		cause?: Error,
		affectedFiles: string[] = [],
		details?: Record<string, any>,
	) {
		super(message, operation, cause, affectedFiles, details)
		this.name = "RefactorExecutionError"
	}
}

/**
 * Helper function to convert any error to a RefactorError
 */
export function toRefactorError(error: unknown, defaultMessage: string, affectedFiles: string[] = []): RefactorError {
	if (error instanceof RefactorError) {
		return error
	}

	if (error instanceof Error) {
		return new RefactorError(error.message, affectedFiles, { originalError: error.name })
	}

	return new RefactorError(defaultMessage, affectedFiles, { originalError: String(error) })
}
