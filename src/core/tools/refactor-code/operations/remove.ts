import { Project } from "ts-morph"
import { RemoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { RemoveOrchestrator } from "./RemoveOrchestrator"

/**
 * Executes a remove operation using the RemoveOrchestrator.
 * This is a standalone function wrapper around the RemoveOrchestrator for
 * easier testing and backwards compatibility.
 *
 * @param project The ts-morph Project to operate on
 * @param operation The remove operation to execute
 * @returns The operation result
 */
export async function executeRemoveOperation(project: Project, operation: RemoveOperation): Promise<OperationResult> {
	const orchestrator = new RemoveOrchestrator(project)
	return orchestrator.executeRemoveOperation(operation)
}
