
import { Component, createMemo, Show } from "solid-js"
import { Card } from "@kilocode/kilo-ui/card"
import type { AssistantMessage } from "@kilocode/sdk/v2"
import { unwrapError } from "../../utils/errorUtils"

interface ErrorDisplayProps {
  error: NonNullable<AssistantMessage["error"]>
}

export const ErrorDisplay: Component<ErrorDisplayProps> = (props) => {

  const errorText = createMemo(() => {
    const msg = props.error.data?.message
    if (typeof msg === "string") return unwrapError(msg)
    if (msg === undefined || msg === null) return ""
    return unwrapError(String(msg))
  })


  return (
    <Card variant="error" class="error-card">
      {errorText()}
    </Card>
  )
}
