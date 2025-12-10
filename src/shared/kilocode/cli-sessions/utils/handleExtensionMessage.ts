import { ExtensionMessage } from "../../../ExtensionMessage"
import { SessionManager } from "../core/SessionManager"

export function kilo_handleExtensionMessage(message: ExtensionMessage) {
	if (message.type === "apiMessagesSaved" && message.payload) {
		const [taskId, filePath] = message.payload as [string, string]

		SessionManager.init().handleFileUpdate(taskId, "apiConversationHistoryPath", filePath)
	} else if (message.type === "taskMessagesSaved" && message.payload) {
		const [taskId, filePath] = message.payload as [string, string]

		SessionManager.init().handleFileUpdate(taskId, "uiMessagesPath", filePath)
	} else if (message.type === "taskMetadataSaved" && message.payload) {
		const [taskId, filePath] = message.payload as [string, string]

		SessionManager.init().handleFileUpdate(taskId, "taskMetadataPath", filePath)
	} else if (message.type === "currentCheckpointUpdated") {
		SessionManager.init().doSync()
	}
}
