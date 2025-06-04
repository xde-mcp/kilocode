import { useState, useEffect, useRef, useCallback } from "react"
import Handlebars from "handlebars"
import { defaultTemplates } from "./templates"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { Tab, TabContent, TabHeader } from "@src/components/common/Tab"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"
import BottomControls from "../chat/BottomControls"
import EditableCodeBlock from "./EditableCodeBlock"
import { vscode } from "@src/utils/vscode"

type PromptDebuggerViewProps = {
	onDone: () => void
}

const PromptDebuggerView = ({ onDone }: PromptDebuggerViewProps) => {
	const { t } = useAppTranslation()
	const { listApiConfigMeta, currentApiConfigName } = useExtensionState()

	// State for prompt templates
	const [templates, _setTemplates] = useState(defaultTemplates)

	// State for selected template
	const [selectedTemplate, setSelectedTemplate] = useState("documentation")

	// State for prompt input (Handlebars template)
	const [promptInput, setPromptInput] = useState(defaultTemplates[0].content)

	// State for model selection - use the first available model
	const [selectedModel, setSelectedModel] = useState(() => {
		// Use the first available model if there are any, otherwise use the current config
		return listApiConfigMeta && listApiConfigMeta.length > 0 ? listApiConfigMeta[0].id : currentApiConfigName
	})

	// State for debug output
	const [debugOutput, setDebugOutput] = useState("")

	// State for loading
	const [isLoading, setIsLoading] = useState(false)

	// State for rendered template preview
	const [renderedPreview, setRenderedPreview] = useState("")

	// State for LLM response
	const [llmResponse, setLlmResponse] = useState("")

	// Refs for streaming response handling
	const llmResponseRef = useRef("")
	const animationFrameIdRef = useRef<number | null>(null)

	// State for test variables
	const [testVariables, _setTestVariables] = useState({
		user: {
			name: "John Doe",
			email: "john.doe@example.com",
			role: "Developer",
		},
		project: {
			name: "Awesome Project",
			description: "A really cool project",
			version: "1.0.0",
		},
		date: new Date().toLocaleDateString(),
		items: ["Item 1", "Item 2", "Item 3"],
	})

	// Reference to the code editor for cursor position
	const codeEditorRef = useRef<HTMLTextAreaElement | null>(null)

	// Update rendered preview whenever the template changes
	useEffect(() => {
		try {
			const template = Handlebars.compile(promptInput)
			const rendered = template(testVariables)
			setRenderedPreview(rendered)
		} catch (error) {
			// If there's an error in the template, show the error in the preview
			setRenderedPreview(`Template Error: ${(error as Error).message}`)
		}
	}, [promptInput, testVariables])

	// Create API handler for the selected model
	const createApiHandler = useCallback(() => {
		// Get the API configuration for the selected model
		const apiConfig = listApiConfigMeta?.find((config) => config.id === selectedModel)
		if (!apiConfig) return null

		// Request the extension to create an API handler for us
		vscode.postMessage({
			type: "loadApiConfigurationById",
			text: selectedModel,
		})

		// Return true to indicate we've requested the API handler
		return true
	}, [selectedModel, listApiConfigMeta])

	// Initialize the API handler when the selected model changes
	useEffect(() => {
		if (selectedModel) {
			createApiHandler()
		}
	}, [selectedModel, createApiHandler])

	// Function to schedule UI updates for streaming text
	const scheduleUpdate = useCallback(() => {
		if (animationFrameIdRef.current) {
			cancelAnimationFrame(animationFrameIdRef.current)
		}
		animationFrameIdRef.current = requestAnimationFrame(() => {
			setLlmResponse(llmResponseRef.current)
			animationFrameIdRef.current = null
		})
	}, [])

	// Handle template selection change
	const handleTemplateChange = (templateId: string) => {
		setSelectedTemplate(templateId)
		const template = templates.find((t) => t.id === templateId)
		if (template) {
			setPromptInput(template.content)
		}
	}

	// Handle prompt submission
	const handleSubmitPrompt = () => {
		if (!promptInput.trim()) return

		setIsLoading(true)

		// Here we would send the prompt to the extension for processing
		// For now, we'll just simulate a response since we're building the UI
		// In a real implementation, we would need to add a new message type to ExtensionMessage
		// and handle it in the extension

		// Simulate processing
		setDebugOutput(
			`Simulated debug results for prompt: "${promptInput}"\nUsing model: ${selectedModel}\n\nRendered output: "${renderedPreview}"`,
		)

		// For now, just simulate a response
		setTimeout(() => {
			setDebugOutput(
				`Debug results for prompt: "${promptInput}"\nUsing model: ${selectedModel}\n\nRendered output: "${renderedPreview}"`,
			)
			setIsLoading(false)
		}, 1000)
	}

	// Handle LLM API call
	const handleCallLLM = async () => {
		if (!promptInput.trim() || !renderedPreview.trim()) return

		setIsLoading(true)
		setLlmResponse("")
		llmResponseRef.current = ""

		if (animationFrameIdRef.current) {
			cancelAnimationFrame(animationFrameIdRef.current)
			animationFrameIdRef.current = null
		}

		// Set a timeout to reset loading state if no response after 10 seconds
		const timeoutId = setTimeout(() => {
			setIsLoading(false)
			llmResponseRef.current =
				"Request timed out. The model may be unavailable or unsupported. Try selecting a different model from the dropdown."
			scheduleUpdate()
		}, 10000)

		try {
			// Create a unique ID for this request
			const responseId = crypto.randomUUID()

			// Create the message to send to the extension
			const systemPrompt = "You are a helpful AI assistant."

			// Send the message to the extension to call the LLM
			vscode.postMessage({
				type: "promptDebuggerCallLLM",
				text: selectedModel, // The API config ID
				systemPrompt: systemPrompt,
				userPrompt: renderedPreview,
				responseId: responseId,
			})

			// Listen for the response
			const handleResponse = (event: MessageEvent) => {
				const message = event.data

				// Check if this is a response to our request using the dedicated prompt debugger message type
				if (message.type === "promptDebuggerPartialMessage" && message.responseId === responseId) {
					clearTimeout(timeoutId) // Clear the request timeout

					if (message.partialMessage?.type === "say") {
						if (message.partialMessage.say === "text") {
							llmResponseRef.current = message.partialMessage.text || ""
							scheduleUpdate()
						} else if (message.partialMessage.say === "error") {
							llmResponseRef.current = `Error: ${message.partialMessage.text || "Unknown error"}`
							scheduleUpdate()
							setIsLoading(false)
							window.removeEventListener("message", handleResponse) // Clean up this listener
							if (animationFrameIdRef.current) {
								cancelAnimationFrame(animationFrameIdRef.current)
								animationFrameIdRef.current = null
							}
						}
					}
				}
			}

			// Add the event listener
			window.addEventListener("message", handleResponse)

			// Also listen for error messages from the extension
			const handleError = (event: MessageEvent) => {
				const message = event.data
				if (message.type === "error" && message.responseId === responseId) {
					clearTimeout(timeoutId)
					setIsLoading(false)

					let errorMessage = `Error: ${message.text || "Unknown error occurred"}`
					if (message.text && message.text.includes("Unsupported model")) {
						errorMessage = `Error: The selected model "${selectedModel}" is not supported. Please select a different model from the dropdown.`
					}
					llmResponseRef.current = errorMessage
					scheduleUpdate()

					window.removeEventListener("message", handleError) // Clean up this listener
					if (animationFrameIdRef.current) {
						cancelAnimationFrame(animationFrameIdRef.current)
						animationFrameIdRef.current = null
					}
				}
			}
			window.addEventListener("message", handleError)

			// Return cleanup function
			return () => {
				window.removeEventListener("message", handleResponse)
				window.removeEventListener("message", handleError)
				clearTimeout(timeoutId)
				if (animationFrameIdRef.current) {
					cancelAnimationFrame(animationFrameIdRef.current)
					animationFrameIdRef.current = null
				}
				setIsLoading(false) // Ensure loading is false on cleanup
			}
		} catch (error) {
			console.error("Error calling LLM:", error)
			setLlmResponse(`Error: ${(error as Error).message}`)
			setIsLoading(false)
			clearTimeout(timeoutId)
		}
	}

	// Insert variable at cursor position
	const insertVariable = (variablePath: string) => {
		// Get the textarea element using the ref instead of querySelector
		if (!codeEditorRef.current) {
			// Try to find it with querySelector as fallback
			const textArea = document.querySelector("textarea") as HTMLTextAreaElement
			if (!textArea) return

			// Store the reference for future use
			codeEditorRef.current = textArea
		}

		const textArea = codeEditorRef.current
		const cursorPos = textArea.selectionStart
		const textBefore = promptInput.substring(0, cursorPos)
		const textAfter = promptInput.substring(cursorPos)

		// Insert the variable with Handlebars syntax
		const newText = `${textBefore}{{${variablePath}}}${textAfter}`
		setPromptInput(newText)

		// Focus back on the textarea and set cursor position after the inserted variable
		setTimeout(() => {
			textArea.focus()
			const newCursorPos = cursorPos + variablePath.length + 4 // +4 for the {{ and }}
			textArea.setSelectionRange(newCursorPos, newCursorPos)
		}, 10) // Increased timeout to ensure DOM updates
	}

	// Handle model selection change
	const handleModelChange = (value: string) => {
		setSelectedModel(value)

		// Reset loading state if it's currently loading
		if (isLoading) {
			setIsLoading(false)
			setLlmResponse("Model changed. Please try again with the new model.")
		}

		// Update the current API config in the extension
		vscode.postMessage({
			type: "currentApiConfigName",
			text: value,
		})
	}

	// Handle clearing the form
	const handleClear = () => {
		setPromptInput("")
		setDebugOutput("")
		setRenderedPreview("")
		setLlmResponse("")
	}

	return (
		<Tab>
			<TabHeader className="flex justify-between items-center">
				<h3 className="text-vscode-foreground m-0">{t("Prompt Debugger")}</h3>
				<Button onClick={onDone}>{t("Done")}</Button>
			</TabHeader>

			<TabContent>
				<div className="mb-5">
					<div className="grid grid-cols-2 gap-4 mb-4">
						<div>
							<h4 className="text-vscode-foreground m-0 mb-2">{t("Template Selection")}</h4>
							<Select value={selectedTemplate} onValueChange={handleTemplateChange}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder={t("Select a template")} />
								</SelectTrigger>
								<SelectContent>
									{templates.map((template) => (
										<SelectItem key={template.id} value={template.id}>
											{template.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<h4 className="text-vscode-foreground m-0 mb-2">{t("Model Selection")}</h4>
							<Select value={selectedModel} onValueChange={handleModelChange}>
								<SelectTrigger data-testid="api-config-select" className="w-full">
									<SelectValue placeholder={t("Select a model")} />
								</SelectTrigger>
								<SelectContent>
									{(listApiConfigMeta || []).map((config) => (
										<SelectItem key={config.id} value={config.id}>
											{config.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="mb-2">
						<div className="flex flex-wrap gap-2 mb-2 p-2 bg-vscode-editor-background rounded border border-vscode-panel-border">
							<Button variant="outline" size="sm" onClick={() => insertVariable("user.name")}>
								user.name
							</Button>
							<Button variant="outline" size="sm" onClick={() => insertVariable("user.email")}>
								user.email
							</Button>
							<Button variant="outline" size="sm" onClick={() => insertVariable("user.role")}>
								user.role
							</Button>
							<Button variant="outline" size="sm" onClick={() => insertVariable("project.name")}>
								project.name
							</Button>
							<Button variant="outline" size="sm" onClick={() => insertVariable("project.description")}>
								project.description
							</Button>
							<Button variant="outline" size="sm" onClick={() => insertVariable("project.version")}>
								project.version
							</Button>
							<Button variant="outline" size="sm" onClick={() => insertVariable("date")}>
								date
							</Button>
							<Button variant="outline" size="sm" onClick={() => insertVariable("items")}>
								items
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4 mb-4">
						<div>
							<h4 className="text-vscode-foreground m-0 mb-2">{t("Template")}</h4>
							<EditableCodeBlock
								ref={codeEditorRef}
								value={promptInput}
								onChange={setPromptInput}
								language="handlebars"
								placeholder={t("Enter your template here... (e.g. Hello {{user.name}}!)")}
								rows={8}
								className="w-full"
							/>
						</div>
						<div>
							<h4 className="text-vscode-foreground m-0 mb-2">{t("Rendered Preview")}</h4>
							<div className="bg-vscode-editor-background p-4 rounded border border-vscode-panel-border whitespace-pre-wrap h-[calc(100%-2.5rem)] overflow-auto">
								{renderedPreview || t("Preview will appear here...")}
							</div>
						</div>
					</div>

					<div className="flex gap-2 mb-4">
						<Button onClick={handleCallLLM} disabled={isLoading || !promptInput.trim()}>
							{isLoading ? t("Processing...") : t("Call LLM")}
						</Button>
						<Button
							onClick={handleSubmitPrompt}
							disabled={isLoading || !promptInput.trim()}
							variant="outline">
							{t("Debug Prompt")}
						</Button>
						<Button variant="outline" onClick={handleClear} disabled={isLoading}>
							{t("Clear")}
						</Button>
					</div>

					<div className="mb-4">
						<h4 className="text-vscode-foreground m-0 mb-2">{t("LLM Response")}</h4>
						<div className="bg-vscode-editor-background p-4 rounded border border-vscode-panel-border whitespace-pre-wrap min-h-[100px]">
							{llmResponse || t("LLM response will appear here after clicking 'Call LLM'...")}
						</div>
					</div>

					{debugOutput && (
						<div className="mb-4">
							<h4 className="text-vscode-foreground m-0 mb-2">{t("Debug Output")}</h4>
							<div className="bg-vscode-editor-background p-4 rounded border border-vscode-panel-border whitespace-pre-wrap">
								{debugOutput}
							</div>
						</div>
					)}
				</div>
			</TabContent>

			<div className="fixed inset-0 top-auto">
				<BottomControls />
			</div>
		</Tab>
	)
}

export default PromptDebuggerView
