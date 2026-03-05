/** @jsxImportSource solid-js */
import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { SessionTurn } from "@opencode-ai/ui/session-turn"
import { DataProvider } from "@opencode-ai/ui/context/data"
import { DiffComponentProvider } from "@opencode-ai/ui/context/diff"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { Diff } from "@opencode-ai/ui/diff"
import type { UserMessage, AssistantMessage, TextPart } from "@kilocode/sdk/v2"

const now = Date.now()

function makeSession(id: string, error: AssistantMessage["error"]) {
  const sessionID = `error-details-${id}`
  const userMsgID = `user-msg-${id}`
  const asstMsgID = `asst-msg-${id}`

  const userMessage: UserMessage = {
    id: userMsgID,
    sessionID,
    role: "user",
    time: { created: now - 10000 },
    agent: "default",
    model: { providerID: "anthropic", modelID: "claude-3-5-sonnet" },
  }

  const assistantMessage: AssistantMessage = {
    id: asstMsgID,
    sessionID,
    role: "assistant",
    parentID: userMsgID,
    time: { created: now - 9000, completed: now - 8000 },
    modelID: "claude-3-5-sonnet",
    providerID: "anthropic",
    mode: "default",
    agent: "default",
    path: { cwd: "/project", root: "/project" },
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    error,
  }

  const userTextPart: TextPart = {
    id: `part-user-${id}`,
    sessionID,
    messageID: userMsgID,
    type: "text",
    text: "Tell me about SolidJS signals.",
  }

  const data = {
    session: [],
    session_status: { [sessionID]: { type: "idle" as const } },
    session_diff: {},
    message: { [sessionID]: [userMessage, assistantMessage] },
    part: { [userMsgID]: [userTextPart], [asstMsgID]: [] },
  }

  return { sessionID, userMsgID, data }
}

function Providers(props: { data: any; children: any }) {
  return (
    <DataProvider data={props.data} directory="/project">
      <DiffComponentProvider component={Diff}>
        <DialogProvider>
          <MarkedProvider>{props.children}</MarkedProvider>
        </DialogProvider>
      </DiffComponentProvider>
    </DataProvider>
  )
}

function ErrorStory(props: { id: string; error: AssistantMessage["error"] }) {
  const { sessionID, userMsgID, data } = makeSession(props.id, props.error)
  return (
    <Providers data={data}>
      <div style={{ width: "700px" }}>
        <SessionTurn sessionID={sessionID} messageID={userMsgID} lastUserMessageID={userMsgID} />
      </div>
    </Providers>
  )
}

const meta: Meta = {
  title: "Components/ErrorDetails",
  parameters: { layout: "padded" },
}

export default meta
type Story = StoryObj

export const ApiError: Story = {
  render: () => (
    <ErrorStory
      id="api"
      error={{
        name: "APIError",
        data: {
          message: "Request failed: 429 Too Many Requests",
          statusCode: 429,
          isRetryable: true,
          responseBody: JSON.stringify(
            {
              error: {
                type: "rate_limit_error",
                message: "You have exceeded the rate limit. Please try again in 30 seconds.",
              },
            },
            null,
            2,
          ),
          metadata: { "x-request-id": "req_01abc123", region: "us-east-1" },
        },
      }}
    />
  ),
}

export const ApiErrorMinimal: Story = {
  name: "API Error (minimal)",
  render: () => (
    <ErrorStory
      id="api-min"
      error={{
        name: "APIError",
        data: {
          message: "Internal server error",
          statusCode: 500,
          isRetryable: false,
        },
      }}
    />
  ),
}

export const ProviderAuthError: Story = {
  render: () => (
    <ErrorStory
      id="auth"
      error={{
        name: "ProviderAuthError",
        data: {
          message: "Invalid API key provided. Please check your credentials.",
          providerID: "anthropic",
        },
      }}
    />
  ),
}

export const ContextOverflowError: Story = {
  render: () => (
    <ErrorStory
      id="ctx"
      error={{
        name: "ContextOverflowError",
        data: {
          message: "Context window exceeded: 210,000 tokens used out of 200,000 maximum.",
          responseBody: "The conversation has exceeded the model's context window. Please start a new session.",
        },
      }}
    />
  ),
}

export const StructuredOutputError: Story = {
  render: () => (
    <ErrorStory
      id="struct"
      error={{
        name: "StructuredOutputError",
        data: {
          message: "Failed to parse model output as valid JSON after multiple attempts.",
          retries: 3,
        },
      }}
    />
  ),
}

export const UnknownError: Story = {
  name: "Unknown Error (no details)",
  render: () => (
    <ErrorStory
      id="unknown"
      error={{
        name: "UnknownError",
        data: {
          message: "An unexpected error occurred. Please try again.",
        },
      }}
    />
  ),
}
