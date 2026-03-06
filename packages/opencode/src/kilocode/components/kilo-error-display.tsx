import { createMemo, Match, Switch, type JSX } from "solid-js"
import { SplitBorder } from "@tui/component/border"
import { useTheme } from "@tui/context/theme"
import { KILO_ERROR_CODES, parseKiloErrorCode } from "@/kilocode/kilo-errors"
import type { AssistantMessage } from "@kilocode/sdk/v2"

interface KiloErrorBlockProps {
  error: NonNullable<AssistantMessage["error"]>
  fallback: JSX.Element
}

export function KiloErrorBlock(props: KiloErrorBlockProps) {
  const { theme } = useTheme()

  const kiloErrorCode = createMemo(() => {
    return parseKiloErrorCode(props.error)
  })

  const kiloErrorTitle = createMemo(() => {
    switch (kiloErrorCode()) {
      case KILO_ERROR_CODES.PAID_MODEL_AUTH_REQUIRED:
        return "You need to sign in to use this model"
      case KILO_ERROR_CODES.PROMOTION_MODEL_LIMIT_REACHED:
        return "You need to sign up to keep going"
      default:
        return undefined
    }
  })

  const kiloErrorDescription = createMemo(() => {
    switch (kiloErrorCode()) {
      case KILO_ERROR_CODES.PAID_MODEL_AUTH_REQUIRED:
        return "Sign in or create an account to access over 500 models, use credits at cost, or bring your own key."
      case KILO_ERROR_CODES.PROMOTION_MODEL_LIMIT_REACHED:
        return "Sign up for free to continue and explore 500 other models. Takes 2 minutes, no credit card required. Or come back later."
      default:
        return undefined
    }
  })

  return (
    <Switch fallback={props.fallback}>
      <Match when={kiloErrorCode()}>
        <box
          border={["left"]}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          marginTop={1}
          backgroundColor={theme.backgroundPanel}
          customBorderChars={SplitBorder.customBorderChars}
          borderColor={theme.primary}
        >
          <text fg={theme.text}>{kiloErrorTitle()}</text>
          <text fg={theme.textMuted}>{kiloErrorDescription()}</text>
          <text fg={theme.primary}>{"Run /connect or `kilo auth login` to sign in to Kilo Gateway"}</text>
        </box>
      </Match>
    </Switch>
  )
}
