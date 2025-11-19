import { TrpcClient, TrpcResponse } from "./trpcClient.js"

// Type definitions matching backend schema
export interface Session {
	id: string
	title: string
	created_at: string
	updated_at: string
}

export interface SessionWithSignedUrls extends Session {
	api_conversation_history: string | null
	task_metadata: string | null
	ui_messages: string | null
}

export interface GetSessionInput {
	sessionId: string
	includeBlobs?: boolean
}

export type GetSessionOutput = Session | SessionWithSignedUrls

export interface CreateSessionInput {
	title?: string
	api_conversation_history?: unknown
	task_metadata?: unknown
	ui_messages?: unknown
}

export type CreateSessionOutput = Session

export interface UpdateSessionInput {
	sessionId: string
	title?: string
	api_conversation_history?: unknown
	task_metadata?: unknown
	ui_messages?: unknown
}

export interface UpdateSessionOutput {
	id: string
	title: string
	updated_at: string
}

export interface ListSessionsInput {
	cursor?: string
	limit?: number
}

export interface ListSessionsOutput {
	cliSessions: Session[]
	nextCursor: string | null
}

export class SessionClient {
	private static instance: SessionClient | null = null

	static getInstance() {
		if (!SessionClient.instance) {
			SessionClient.instance = new SessionClient()
		}

		return SessionClient.instance!
	}

	private constructor() {}

	/**
	 * Get a specific session by ID
	 */
	async get(input: GetSessionInput): Promise<GetSessionOutput> {
		const client = TrpcClient.init()
		const response = await client.request<GetSessionInput, TrpcResponse<GetSessionOutput>>(
			"cliSessions.get",
			"GET",
			input,
		)
		return response.result.data
	}

	/**
	 * Create a new session
	 */
	async create(input: CreateSessionInput): Promise<CreateSessionOutput> {
		const client = TrpcClient.init()
		const response = await client.request<CreateSessionInput, TrpcResponse<CreateSessionOutput>>(
			"cliSessions.create",
			"POST",
			input,
		)
		return response.result.data
	}

	/**
	 * Update an existing session
	 */
	async update(input: UpdateSessionInput): Promise<UpdateSessionOutput> {
		const client = TrpcClient.init()
		const response = await client.request<UpdateSessionInput, TrpcResponse<UpdateSessionOutput>>(
			"cliSessions.update",
			"POST",
			input,
		)
		return response.result.data
	}

	/**
	 * List sessions with pagination support
	 */
	async list(input?: ListSessionsInput): Promise<ListSessionsOutput> {
		const client = TrpcClient.init()
		const response = await client.request<ListSessionsInput, TrpcResponse<ListSessionsOutput>>(
			"cliSessions.list",
			"GET",
			input || {},
		)
		return response.result.data
	}
}
