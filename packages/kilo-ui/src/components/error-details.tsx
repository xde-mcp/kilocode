import type { AssistantMessage } from "@kilocode/sdk/v2/client"
import { For, Show } from "solid-js"
import { useI18n, type UiI18nKey } from "@opencode-ai/ui/context/i18n"

type ErrorType = NonNullable<AssistantMessage["error"]>

export function hasErrorDetails(error: ErrorType | undefined): boolean {
  if (!error) return false
  switch (error.name) {
    case "APIError":
      return !!(error.data.statusCode || error.data.responseBody || error.data.metadata)
    case "ProviderAuthError":
      return !!error.data.providerID
    case "ContextOverflowError":
      return !!error.data.responseBody
    case "StructuredOutputError":
      return error.data.retries > 0
    case "MessageOutputLengthError":
      return Object.keys(error.data).length > 0
    default:
      return false
  }
}

interface ErrorDetailsProps {
  error: ErrorType
}

export function ErrorDetails(props: ErrorDetailsProps) {
  const i18n = useI18n()
  const t = (key: string) => i18n.t(key as UiI18nKey)

  const rows = () => {
    const error = props.error
    const result: Array<{ label: string; value: string; pre?: boolean }> = []

    result.push({ label: t("error.details.type"), value: error.name })

    switch (error.name) {
      case "APIError": {
        if (error.data.statusCode) {
          result.push({ label: t("error.details.statusCode"), value: String(error.data.statusCode) })
        }
        result.push({ label: t("error.details.retryable"), value: error.data.isRetryable ? "Yes" : "No" })
        if (error.data.responseBody) {
          result.push({ label: t("error.details.responseBody"), value: error.data.responseBody, pre: true })
        }
        if (error.data.metadata && Object.keys(error.data.metadata).length > 0) {
          result.push({
            label: "Metadata",
            value: JSON.stringify(error.data.metadata, null, 2),
            pre: true,
          })
        }
        break
      }
      case "ProviderAuthError": {
        result.push({ label: t("error.details.provider"), value: error.data.providerID })
        break
      }
      case "ContextOverflowError": {
        if (error.data.responseBody) {
          result.push({ label: t("error.details.responseBody"), value: error.data.responseBody, pre: true })
        }
        break
      }
      case "StructuredOutputError": {
        result.push({ label: t("error.details.retries"), value: String(error.data.retries) })
        break
      }
      case "MessageOutputLengthError": {
        const data = error.data
        if (Object.keys(data).length > 0) {
          result.push({ label: "Data", value: JSON.stringify(data, null, 2), pre: true })
        }
        break
      }
    }

    return result
  }

  return (
    <div class="error-details">
      <For each={rows()}>
        {(row) => (
          <div class="error-detail-row">
            <span class="error-detail-label">{row.label}</span>
            <Show when={row.pre} fallback={<span class="error-detail-value">{row.value}</span>}>
              <pre class="error-detail-pre">{row.value}</pre>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}
