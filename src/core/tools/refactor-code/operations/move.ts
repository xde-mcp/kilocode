import { Project } from "ts-morph"
import { MoveOperation } from "../schema"
import { OperationResult } from "../engine"
import { MoveOrchestrator } from "./MoveOrchestrator"

/**
 * @deprecated Use MoveOrchestrator.executeMoveOperation instead
 */
export async function executeMoveOperation(project: Project, operation: MoveOperation): Promise<OperationResult> {
	const orchestrator = new MoveOrchestrator(project)
	return orchestrator.executeMoveOperation(operation)
}
