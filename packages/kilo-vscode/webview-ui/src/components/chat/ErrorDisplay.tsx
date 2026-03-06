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
        <div>
          <div>
            <span>✨</span>
            <span>You need to sign in to use this model</span>
          </div>
          <p>
            Sign in or create an account to access over 500 models, use credits at cost, or bring your own key.
          </p>
          <Button variant="primary" onClick={() => props.onLogin?.()}>Sign In</Button>
        </div>
      </Match>
      <Match when={isUnauthorizedPromotionLimitError(parsed())}>
        <div>
          <div>
            <span>🕙</span>
            <span>You need to sign up to keep going</span>
          </div>
          <p>
            Sign up for free to continue and explore 500 other models. Takes 2 minutes, no credit card required. Or come back later.
          </p>
          <Button variant="primary" onClick={() => props.onLogin?.()}>Sign Up</Button>
        </div>
      </Match>
    </Switch>
  )
}
