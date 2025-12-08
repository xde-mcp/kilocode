package ai.kilocode.jetbrains.inline

import com.intellij.codeInsight.inline.completion.InlineCompletionEvent
import com.intellij.codeInsight.inline.completion.InlineCompletionProvider
import com.intellij.codeInsight.inline.completion.InlineCompletionProviderID
import com.intellij.codeInsight.inline.completion.InlineCompletionRequest
import com.intellij.codeInsight.inline.completion.InlineCompletionSuggestion
import com.intellij.codeInsight.inline.completion.elements.InlineCompletionElement
import com.intellij.codeInsight.inline.completion.elements.InlineCompletionGrayTextElement
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import kotlinx.coroutines.flow.flowOf

/**
 * IntelliJ inline completion provider that bridges to VSCode extension's Ghost service.
 * This provider uses the new InlineCompletionService which sends full file content
 * to the Ghost service via RPC for accurate completions.
 *
 * The provider handles triggering and rendering, while all AI logic (debouncing,
 * caching, context gathering, and telemetry) is handled by the Ghost service.
 */
class KiloCodeInlineCompletionProvider(
    private val handle: Int,
    private val project: Project,
    private val extensionId: String,
    private val displayName: String?
) : InlineCompletionProvider {
    
    private val logger = Logger.getInstance(KiloCodeInlineCompletionProvider::class.java)
    private val completionService = InlineCompletionService.getInstance()
    
    /**
     * Unique identifier for this provider.
     * Required by InlineCompletionProvider interface.
     */
    override val id: InlineCompletionProviderID = InlineCompletionProviderID("kilocode-inline-completion-$extensionId-$handle")
    
    /**
     * Gets inline completion suggestions using the Ghost service.
     * Sends full file content to ensure accurate completions.
     */
    override suspend fun getSuggestion(request: InlineCompletionRequest): InlineCompletionSuggestion {
        logger.info("Inline completion requested for handle=$handle, extensionId=$extensionId")
        
        try {
            // Get document and position information
            val editor = request.editor
            val document = editor.document
            val offset = request.endOffset
            
            // Calculate line and character position
            val lineNumber = document.getLineNumber(offset)
            val lineStartOffset = document.getLineStartOffset(lineNumber)
            val character = offset - lineStartOffset
            
            // Get language ID from file type
            val virtualFile = FileDocumentManager.getInstance().getFile(document)
            val languageId = virtualFile?.fileType?.name?.lowercase() ?: "text"
            
            logger.info("Requesting completion at line=$lineNumber, char=$character, language=$languageId")
            
            // Call the new service with full file content
            val result = completionService.getInlineCompletions(
                project,
                document,
                lineNumber,
                character,
                languageId
            )
            
            // Convert result to InlineCompletionSuggestion
            return when (result) {
                is InlineCompletionService.Result.Success -> {
                    if (result.items.isEmpty()) {
                        logger.info("No completion items returned")
                        InlineCompletionSuggestion.empty()
                    } else {
                        val firstItem = result.items[0]
                        logger.info("Received completion: ${firstItem.insertText.take(50)}...")
                        
                        // Create completion elements
                        val elements = createCompletionElements(firstItem.insertText)
                        InlineCompletionSuggestion.Default(flowOf(*elements.toTypedArray()))
                    }
                }
                is InlineCompletionService.Result.Error -> {
                    logger.warn("Completion failed: ${result.errorMessage}")
                    InlineCompletionSuggestion.empty()
                }
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            // Normal cancellation - user continued typing
            logger.debug("Inline completion cancelled (user continued typing)")
            throw e // Re-throw to properly propagate cancellation
        } catch (e: java.util.concurrent.CancellationException) {
            // Java cancellation - also normal flow
            logger.debug("Inline completion cancelled (Java cancellation)")
            return InlineCompletionSuggestion.empty()
        } catch (e: Exception) {
            // Check if this is a wrapped cancellation
            if (e.cause is kotlinx.coroutines.CancellationException ||
                e.cause is java.util.concurrent.CancellationException) {
                logger.debug("Inline completion cancelled (wrapped): ${e.message}")
                return InlineCompletionSuggestion.empty()
            }
            
            // Real error - log appropriately
            logger.error("Error getting inline completion suggestion", e)
            return InlineCompletionSuggestion.empty()
        }
    }
    
    /**
     * Determines if this provider is enabled for the given event.
     * Document selector matching is handled during registration.
     */
    override fun isEnabled(event: InlineCompletionEvent): Boolean {
        return true
    }
    
    /**
     * Converts a completion item text to InlineCompletionElements for rendering.
     * Handles both single-line and multi-line completions.
     */
    private fun createCompletionElements(text: String): List<InlineCompletionElement> {
        // Split text into lines if it contains newlines
        val lines = text.split("\n")
        
        if (lines.size == 1) {
            // Single line completion - simple gray text
            return listOf(InlineCompletionGrayTextElement(text))
        }
        
        // Multi-line completion - create elements for each line
        val elements = mutableListOf<InlineCompletionElement>()
        
        for ((index, line) in lines.withIndex()) {
            // Add the line content
            if (line.isNotEmpty()) {
                elements.add(InlineCompletionGrayTextElement(line))
            }
            
            // Add newline element for all lines except the last
            if (index < lines.size - 1) {
                elements.add(InlineCompletionGrayTextElement("\n"))
            }
        }
        
        return elements
    }
}