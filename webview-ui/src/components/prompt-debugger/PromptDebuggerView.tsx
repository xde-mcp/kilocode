import React, { useState } from "react"
import { VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { Trans } from "react-i18next"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { Tab, TabContent, TabHeader } from "@src/components/common/Tab"
import {
    Button,
    Input,
    Textarea,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@src/components/ui"
import BottomControls from "../chat/BottomControls"

type PromptDebuggerViewProps = {
    onDone: () => void
}

const PromptDebuggerView = ({ onDone }: PromptDebuggerViewProps) => {
    const { t } = useAppTranslation()
    const { listApiConfigMeta, currentApiConfigName } = useExtensionState()

    // State for prompt input
    const [promptInput, setPromptInput] = useState("")

    // State for model selection
    const [selectedModel, setSelectedModel] = useState(currentApiConfigName)

    // State for debug output
    const [debugOutput, setDebugOutput] = useState("")

    // State for loading
    const [isLoading, setIsLoading] = useState(false)

    // Handle prompt submission
    const handleSubmitPrompt = () => {
        if (!promptInput.trim()) return

        setIsLoading(true)

        // Here we would send the prompt to the extension for processing
        // For now, we'll just simulate a response since we're building the UI
        // In a real implementation, we would need to add a new message type to ExtensionMessage
        // and handle it in the extension

        // Simulate processing
        setDebugOutput(`Simulated debug results for prompt: "${promptInput}"\nUsing model: ${selectedModel}\n\nThis is a placeholder for actual debug output that would come from the extension.`)

        // For now, just simulate a response
        setTimeout(() => {
            setDebugOutput(`Debug results for prompt: "${promptInput}"\nUsing model: ${selectedModel}\n\nThis is a placeholder for actual debug output.`)
            setIsLoading(false)
        }, 1000)
    }

    // Handle model selection change
    const handleModelChange = (value: string) => {
        setSelectedModel(value)
    }

    // Handle clearing the form
    const handleClear = () => {
        setPromptInput("")
        setDebugOutput("")
    }

    return (
        <Tab>
            <TabHeader className="flex justify-between items-center">
                <h3 className="text-vscode-foreground m-0">{t("Prompt Debugger")}</h3>
                <Button onClick={onDone}>{t("Done")}</Button>
            </TabHeader>

            <TabContent>
                <div className="mb-5">
                    <div className="mb-2">
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

                    <div className="mb-4">
                        <h4 className="text-vscode-foreground m-0 mb-2">{t("Prompt Input")}</h4>
                        <VSCodeTextArea
                            className="w-full"
                            rows={5}
                            value={promptInput}
                            onChange={(e) => {
                                const target = e.target as HTMLTextAreaElement
                                setPromptInput(target.value)
                            }}
                            placeholder={t("Enter your prompt here...")}
                        />
                    </div>

                    <div className="flex gap-2 mb-4">
                        <Button
                            onClick={handleSubmitPrompt}
                            disabled={isLoading || !promptInput.trim()}
                        >
                            {isLoading ? t("Processing...") : t("Debug Prompt")}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleClear}
                            disabled={isLoading}
                        >
                            {t("Clear")}
                        </Button>
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