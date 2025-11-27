/**
 * Interface for providing file system paths needed by session management.
 * Implementations should provide methods to resolve paths for various session-related files and directories.
 */
export interface IPathProvider {
	/**
	 * Get the directory where task data is stored.
	 * @returns The absolute path to the tasks directory
	 */
	getTasksDir(): string

	/**
	 * Get the path to the file that stores the last active session ID for a workspace.
	 * @param workspaceDir The workspace directory path
	 * @returns The absolute path to the last session file
	 */
	getLastSessionPath(workspaceDir: string): string
}
