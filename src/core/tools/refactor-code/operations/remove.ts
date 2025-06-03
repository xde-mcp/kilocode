import { Project } from "ts-morph"
import { RemoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { RemoveOrchestrator } from "./RemoveOrchestrator"

/**
 * @deprecated Use RemoveOrchestrator.executeRemoveOperation instead
 */
export async function executeRemoveOperation(project: Project, operation: RemoveOperation): Promise<OperationResult> {
	const orchestrator = new RemoveOrchestrator(project)
	return orchestrator.executeRemoveOperation(operation)
}
