import * as vscode from "vscode"
import { VisibleCodeTracker } from "../context/VisibleCodeTracker"
import { FileIgnoreController } from "../shims/FileIgnoreController"
import { ChatTextAreaAutocomplete } from "./ChatTextAreaAutocomplete"
import { AutocompleteTelemetry } from "../classic-auto-complete/AutocompleteTelemetry"
import type { ChatCompletionRequestMessage, ChatCompletionResponseSender } from "./handleChatCompletionRequest"
import type { KiloConnectionService } from "../../cli-backend"

/**
 * Caches per-request objects (FileIgnoreController, VisibleCodeTracker,
 * AutocompleteTelemetry) so they aren't re-created on every keystroke.
 *
 * The controller is refreshed only when the workspace changes.
 */
export class ChatAutocompleteService {
  private ignore: FileIgnoreController | null = null
  private dir = ""
  readonly telemetry = new AutocompleteTelemetry("chat-textarea")

  async handle(
    message: ChatCompletionRequestMessage,
    sender: ChatCompletionResponseSender,
    connection: KiloConnectionService,
    signal?: AbortSignal,
  ): Promise<void> {
    const text = message.text || ""
    const id = message.requestId || ""

    if (signal?.aborted) return

    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ""

    // Re-initialize the ignore controller only when the workspace changes
    if (!this.ignore || this.dir !== workspace) {
      this.ignore?.dispose()
      this.ignore = new FileIgnoreController(workspace)
      await this.ignore.initialize()
      this.dir = workspace
    }

    if (signal?.aborted) return

    const tracker = new VisibleCodeTracker(workspace, this.ignore)
    const context = await tracker.captureVisibleCode()

    const autocomplete = new ChatTextAreaAutocomplete(connection, this.telemetry)
    const { suggestion } = await autocomplete.getCompletion(text, context, signal)

    if (!signal?.aborted) {
      sender.postMessage({ type: "chatCompletionResult", text: suggestion, requestId: id })
    }
  }

  dispose() {
    this.ignore?.dispose()
    this.ignore = null
  }
}
