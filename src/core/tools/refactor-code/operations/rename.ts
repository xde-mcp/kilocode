import { Project } from "ts-morph"
import { RenameOperation } from "../schema"
import { OperationResult } from "../engine"
import { RenameOrchestrator } from "./RenameOrchestrator"

/**
 * Executes a rename operation using the RenameOrchestrator.
 * This is a standalone function wrapper around the RenameOrchestrator for
 * easier testing and backwards compatibility.
 *
 * @param project The ts-morph Project to operate on
 * @param operation The rename operation to execute
 * @returns The operation result
 */
export async function executeRenameOperation(project: Project, operation: RenameOperation): Promise<OperationResult> {
	const orchestrator = new RenameOrchestrator(project)
	return orchestrator.executeRenameOperation(operation)
}
