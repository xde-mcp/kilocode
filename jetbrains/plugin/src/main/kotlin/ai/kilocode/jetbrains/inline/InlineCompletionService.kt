package ai.kilocode.jetbrains.inline

import ai.kilocode.jetbrains.core.PluginContext
import ai.kilocode.jetbrains.core.ServiceProxyRegistry
import ai.kilocode.jetbrains.i18n.I18n
import ai.kilocode.jetbrains.ipc.proxy.LazyPromise
import ai.kilocode.jetbrains.ipc.proxy.interfaces.ExtHostCommandsProxy
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import kotlinx.coroutines.withTimeout

/**
 * Service responsible for getting inline completions via RPC communication
 * with the VSCode extension's Ghost service. Encapsulates all RPC logic,
 * error handling, and result processing for inline completion generation.
 */
class InlineCompletionService {
    private val logger: Logger = Logger.getInstance(InlineCompletionService::class.java)

    /**
     * Result wrapper for inline completion operations.
     */
    sealed class Result {
        data class Success(val items: List<CompletionItem>) : Result()
        data class Error(val errorMessage: String) : Result()
    }

    /**
     * Completion item data class representing a single inline completion suggestion.
     */
    data class CompletionItem(
        val insertText: String,
        val range: Range?
    )

    /**
     * Range data class representing a text range in the document.
     */
    data class Range(
        val start: Position,
        val end: Position
    )

    /**
     * Position data class representing a cursor position in the document.
     */
    data class Position(
        val line: Int,
        val character: Int
    )

    /**
     * Gets inline completions using the VSCode extension via RPC.
     * Sends the full file content to ensure accurate completions.
     *
     * @param project The current project context
     * @param document The document to get completions for
     * @param line The line number (0-based)
     * @param character The character position (0-based)
     * @param languageId The language identifier (e.g., "kotlin", "java")
     * @return Result containing either the completion items or error information
     */
    suspend fun getInlineCompletions(
        project: Project,
        document: Document,
        line: Int,
        character: Int,
        languageId: String
    ): Result {
        return try {
            val proxy = getRPCProxy(project)
            if (proxy == null) {
                logger.error("Failed to get RPC proxy - extension not connected")
                return Result.Error(I18n.t("kilocode:inlineCompletion.errors.connectionFailed"))
            }

            val rpcResult = executeRPCCommand(proxy, document, line, character, languageId)
            processCommandResult(rpcResult)
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            logger.warn("Inline completion timed out after ${InlineCompletionConstants.RPC_TIMEOUT_MS}ms", e)
            Result.Error(I18n.t("kilocode:inlineCompletion.errors.timeout"))
        } catch (e: kotlinx.coroutines.CancellationException) {
            // Normal cancellation - user continued typing or request was superseded
            // This is expected behavior, not an error
            logger.debug("Inline completion cancelled (user continued typing)", e)
            Result.Success(emptyList()) // Return empty result, not an error
        } catch (e: java.util.concurrent.CancellationException) {
            // Java cancellation exception - also normal flow
            logger.debug("Inline completion cancelled (Java cancellation)", e)
            Result.Success(emptyList())
        } catch (e: Exception) {
            // Check if this is a wrapped cancellation exception
            if (e.cause is kotlinx.coroutines.CancellationException ||
                e.cause is java.util.concurrent.CancellationException ||
                e.message?.contains("cancelled", ignoreCase = true) == true) {
                logger.debug("Inline completion cancelled (wrapped exception): ${e.message}")
                return Result.Success(emptyList())
            }
            
            // Real error - log as error
            logger.error("Inline completion failed", e)
            Result.Error(I18n.t("kilocode:inlineCompletion.errors.generationFailed",
                mapOf("errorMessage" to (e.message ?: I18n.t("kilocode:inlineCompletion.errors.unknown")))))
        }
    }

    /**
     * Gets the RPC proxy for command execution from the project's PluginContext.
     */
    private fun getRPCProxy(project: Project): ExtHostCommandsProxy? {
        return project.getService(PluginContext::class.java)
            ?.getRPCProtocol()
            ?.getProxy(ServiceProxyRegistry.ExtHostContext.ExtHostCommands)
    }

    /**
     * Executes the inline completion command via RPC with timeout handling.
     * Sends the full document content to the VSCode extension.
     */
    private suspend fun executeRPCCommand(
        proxy: ExtHostCommandsProxy,
        document: Document,
        line: Int,
        character: Int,
        languageId: String
    ): Any? {
        // Get full file content
        val fileContent = document.text
        
        logger.info("===== INLINE COMPLETION RPC CALL START =====")
        logger.info("Document text length: ${fileContent.length}")
        logger.info("Position: line=$line, character=$character")
        logger.info("Language ID: $languageId")
        
        // Get the actual file path from the document
        val virtualFile = FileDocumentManager.getInstance().getFile(document)
        val documentUri = virtualFile?.path?.let { "file://$it" } ?: "file://jetbrains-document"
        
        logger.info("Document URI: $documentUri")
        
        // Prepare arguments for RPC call
        val args = listOf(
            documentUri,
            mapOf(
                "line" to line,
                "character" to character
            ),
            fileContent,
            languageId
        )

        logger.info("RPC Arguments prepared:")
        logger.info("  arg[0] (documentUri): $documentUri (${documentUri::class.simpleName})")
        logger.info("  arg[1] (position): ${args[1]} (${args[1]::class.simpleName})")
        logger.info("  arg[2] (fileContent): <${fileContent.length} chars> (${fileContent::class.simpleName})")
        logger.info("  arg[3] (languageId): $languageId (${languageId::class.simpleName})")

        logger.info("Calling RPC command: ${InlineCompletionConstants.EXTERNAL_COMMAND_ID}")

        val promise: LazyPromise = proxy.executeContributedCommand(
            InlineCompletionConstants.EXTERNAL_COMMAND_ID,
            args,
        )

        logger.info("RPC command executed, waiting for result...")

        // Wait for the result with timeout
        val result = withTimeout(InlineCompletionConstants.RPC_TIMEOUT_MS) {
            promise.await()
        }
        
        logger.info("RPC result received: ${result?.javaClass?.simpleName}")
        logger.info("===== INLINE COMPLETION RPC CALL END =====")
        
        return result
    }

    /**
     * Processes the result from the RPC command and returns appropriate Result.
     * Parses the response map and extracts completion items.
     */
    private fun processCommandResult(result: Any?): Result {
        logger.info("===== PROCESSING RPC RESULT =====")
        logger.info("Result type: ${result?.javaClass?.simpleName}")
        logger.info("Result value: $result")
        
        // Handle invalid result format
        if (result !is Map<*, *>) {
            logger.warn("Received unexpected response format: ${result?.javaClass?.simpleName}, result: $result")
            return Result.Error(I18n.t("kilocode:inlineCompletion.errors.invalidResponse"))
        }

        logger.info("Result is a Map, keys: ${result.keys}")
        
        // Extract response data
        val items = result["items"] as? List<*>
        val error = result["error"] as? String

        logger.info("Extracted items: ${items?.size ?: 0} items")
        logger.info("Extracted error: $error")

        // Handle error response
        if (error != null) {
            logger.warn("Inline completion failed with error: $error")
            return Result.Error(I18n.t("kilocode:inlineCompletion.generationFailed",
                mapOf("errorMessage" to error)))
        }

        // Handle missing items
        if (items == null) {
            logger.warn("Received response without items or error field")
            return Result.Error(I18n.t("kilocode:inlineCompletion.errors.missingItems"))
        }

        logger.info("Processing ${items.size} completion items...")

        // Parse completion items
        val completionItems = items.mapNotNull { item ->
            logger.info("Processing item: ${item?.javaClass?.simpleName}")
            if (item is Map<*, *>) {
                val insertText = item["insertText"] as? String
                logger.info("  insertText: ${insertText?.take(50)}")
                
                if (insertText == null) {
                    logger.warn("  Item missing insertText, skipping")
                    return@mapNotNull null
                }
                
                val rangeMap = item["range"] as? Map<*, *>
                val range = rangeMap?.let {
                    val start = it["start"] as? Map<*, *>
                    val end = it["end"] as? Map<*, *>
                    if (start != null && end != null) {
                        Range(
                            Position(
                                (start["line"] as? Number)?.toInt() ?: 0,
                                (start["character"] as? Number)?.toInt() ?: 0
                            ),
                            Position(
                                (end["line"] as? Number)?.toInt() ?: 0,
                                (end["character"] as? Number)?.toInt() ?: 0
                            )
                        )
                    } else null
                }
                CompletionItem(insertText, range)
            } else {
                logger.warn("  Item is not a Map, skipping")
                null
            }
        }

        // Success case
        logger.info("Successfully received ${completionItems.size} inline completions")
        logger.info("===== PROCESSING COMPLETE =====")
        return Result.Success(completionItems)
    }

    companion object {
        /**
         * Gets or creates the InlineCompletionService instance.
         */
        fun getInstance(): InlineCompletionService {
            return ApplicationManager.getApplication().getService(InlineCompletionService::class.java)
        }
    }
}