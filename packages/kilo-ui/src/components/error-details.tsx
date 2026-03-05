import type { AssistantMessage } from "@kilocode/sdk/v2/client"

type ErrorType = NonNullable<AssistantMessage["error"]>

export function hasErrorDetails(error: ErrorType | undefined): boolean {
  if (!error) return false
  return true
}

interface ErrorDetailsProps {
  error: ErrorType
}

export function ErrorDetails(props: ErrorDetailsProps) {
  const raw = () => JSON.stringify(props.error, null, 2)

  return (
    <div class="error-details">
      <pre class="error-detail-pre">{raw()}</pre>
    </div>
  )
}
