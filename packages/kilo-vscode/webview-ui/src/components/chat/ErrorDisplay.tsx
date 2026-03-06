import { Component, createMemo, Switch, Match } from "solid-js"
import { Card } from "@kilocode/kilo-ui/card"
import { Button } from "@kilocode/kilo-ui/button"
import type { AssistantMessage } from "@kilocode/sdk/v2"
import {
  unwrapError,
  parseAssistantError,
  isUnauthorizedPaidModelError,
  isUnauthorizedPromotionLimitError,
} from "../../utils/errorUtils"

interface ErrorDisplayProps {
  error: NonNullable<AssistantMessage["error"]>
  onLogin?: () => void
}

export const ErrorDisplay: Component<ErrorDisplayProps> = (props) => {
  const parsed = createMemo(() => parseAssistantError(props.error))

  const errorText = createMemo(() => {
    const msg = props.error.data?.message
    if (typeof msg === "string") return unwrapError(msg)
    if (msg === undefined || msg === null) return ""
    return unwrapError(String(msg))
  })

  return (
    <Switch fallback={
      <Card variant="error" class="error-card">
        {errorText()}
      </Card>
    }>
      <Match when={isUnauthorizedPaidModelError(parsed())}>
        <Card variant="error" class="error-card">
          <div>Sign in required</div>
          <p>You need to sign in to use this model.</p>
          <Button onClick={() => props.onLogin?.()}>Sign In</Button>
        </Card>
      </Match>
      <Match when={isUnauthorizedPromotionLimitError(parsed())}>
        <Card variant="error" class="error-card">
          <div>Sign up required</div>
          <p>You need to sign up to keep using this model.</p>
          <Button onClick={() => props.onLogin?.()}>Sign Up</Button>
        </Card>
      </Match>
    </Switch>
  )
}
