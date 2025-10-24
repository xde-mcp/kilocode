# Implementation Plan: /tasks Command for CLI

## Overview

Implement a `/tasks` command in the CLI that provides similar functionality to the webview's HistoryView component, allowing users to:

- View task history
- Search and filter tasks
- Switch between tasks
- Navigate with pagination

## Architecture

### 1. Message Flow

```
CLI (/tasks command)
  ↓
sendWebviewMessage({ type: "taskHistoryRequest", payload })
  ↓
Extension (webviewMessageHandler.ts)
  ↓
getTaskHistory() processing
  ↓
postMessageToWebview({ type: "taskHistoryResponse", payload })
  ↓
CLI (message handler in effects.ts)
  ↓
Update task history atoms
  ↓
Display in TUI
```

### 2. Required Components

#### A. New Atoms (`cli/src/state/atoms/taskHistory.ts`)

```typescript
// Task history state atoms
export const taskHistoryAtom = atom<HistoryItem[]>([])
export const taskHistoryPageAtom = atom<number>(0)
export const taskHistoryPageCountAtom = atom<number>(1)
export const taskHistoryTotalAtom = atom<number>(0)
export const taskHistorySearchQueryAtom = atom<string>("")
export const taskHistorySortOptionAtom = atom<SortOption>("newest")
export const taskHistoryLoadingAtom = atom<boolean>(false)
export const taskHistoryErrorAtom = atom<string | null>(null)

// Action atoms
export const requestTaskHistoryAtom = atom(null, async (get, set, params) => {
	// Send taskHistoryRequest message
})

export const selectTaskAtom = atom(null, async (get, set, taskId: string) => {
	// Send selectTask message to switch to a task
})
```

#### B. New Hook (`cli/src/state/hooks/useTaskHistory.ts`)

```typescript
export function useTaskHistory() {
	const taskHistory = useAtomValue(taskHistoryAtom)
	const currentPage = useAtomValue(taskHistoryPageAtom)
	const pageCount = useAtomValue(taskHistoryPageCountAtom)
	const searchQuery = useAtomValue(taskHistorySearchQueryAtom)
	const sortOption = useAtomValue(taskHistorySortOptionAtom)
	const isLoading = useAtomValue(taskHistoryLoadingAtom)
	const error = useAtomValue(taskHistoryErrorAtom)

	const requestHistory = useSetAtom(requestTaskHistoryAtom)
	const selectTask = useSetAtom(selectTaskAtom)
	const setSearchQuery = useSetAtom(taskHistorySearchQueryAtom)
	const setSortOption = useSetAtom(taskHistorySortOptionAtom)
	const setPage = useSetAtom(taskHistoryPageAtom)

	return {
		tasks: taskHistory,
		currentPage,
		pageCount,
		searchQuery,
		sortOption,
		isLoading,
		error,
		requestHistory,
		selectTask,
		setSearchQuery,
		setSortOption,
		setPage,
	}
}
```

#### C. Tasks Command (`cli/src/commands/tasks.ts`)

```typescript
export const tasksCommand: Command = {
	name: "tasks",
	description: "View and manage task history",
	arguments: [
		{
			name: "action",
			description: "Action to perform (list, search, select)",
			required: false,
		},
		{
			name: "value",
			description: "Value for the action (search query or task ID)",
			required: false,
		},
	],
	options: [
		{
			name: "sort",
			description: "Sort option (newest, oldest, mostExpensive, mostTokens)",
			shorthand: "s",
		},
		{
			name: "page",
			description: "Page number",
			shorthand: "p",
		},
		{
			name: "workspace",
			description: "Filter by workspace (current, all)",
			shorthand: "w",
		},
	],
	handler: async (context: CommandContext) => {
		// Implementation
	},
}
```

#### D. Task History UI Component (`cli/src/ui/components/TaskHistoryView.tsx`)

```typescript
export const TaskHistoryView: React.FC = () => {
	const {
		tasks,
		currentPage,
		pageCount,
		searchQuery,
		sortOption,
		isLoading,
		error,
		requestHistory,
		selectTask,
		setSearchQuery,
		setSortOption,
		setPage,
	} = useTaskHistory()

	// Render task list with:
	// - Search input
	// - Sort dropdown
	// - Task items with ID, name, timestamp, mode
	// - Pagination controls
	// - Select action to switch tasks
}
```

### 3. Message Handlers

#### A. Update `effects.ts` to handle task history responses:

```typescript
case "taskHistoryResponse":
  if (message.payload) {
    set(updateTaskHistoryAtom, message.payload)
  }
  break
```

#### B. Add new message types to `cli/src/types/messages.ts`:

```typescript
export interface TaskHistoryRequestPayload {
	pageIndex: number
	searchQuery?: string
	sortOption?: SortOption
	showAllWorkspaces?: boolean
	showFavoritesOnly?: boolean
}

export interface TaskHistoryResponsePayload {
	historyItems: HistoryItem[]
	pageIndex: number
	pageCount: number
	totalItems: number
}

export type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"
```

### 4. Implementation Steps

1. **Create task history atoms** (`taskHistory.ts`)

    - State atoms for history data, pagination, search, sort
    - Action atoms for requesting history and selecting tasks

2. **Create useTaskHistory hook** (`useTaskHistory.ts`)

    - Encapsulate task history state and actions
    - Provide clean interface for UI components

3. **Implement /tasks command** (`tasks.ts`)

    - Parse command arguments and options
    - Handle different actions: list, search, select
    - Trigger appropriate state updates

4. **Add message handlers** (`effects.ts`)

    - Handle taskHistoryResponse messages
    - Update task history atoms with response data

5. **Create TaskHistoryView component** (`TaskHistoryView.tsx`)

    - Display task list in terminal-friendly format
    - Show search input and sort options
    - Implement pagination controls
    - Handle task selection for switching

6. **Register command** (`commands/index.ts`)

    - Import and register the tasks command

7. **Add task switching logic**
    - Send selectTask message to extension
    - Handle task restoration/resumption

### 5. User Experience

#### Command Usage Examples:

```bash
# List all tasks (default)
/tasks

# Search tasks
/tasks search "implement feature"

# Select and switch to a task
/tasks select task-id-123

# List with options
/tasks --sort=oldest --page=2 --workspace=all

# Short form
/tasks -s oldest -p 2 -w all
```

#### Display Format:

```
Task History (Page 1/5)
Search: [________________] Sort: [Newest ▼]

1. [2024-01-15 10:30] Implement user authentication (code)
   ID: task-123 | Workspace: /project/app

2. [2024-01-15 09:15] Fix navigation bug (debug)
   ID: task-124 | Workspace: /project/app

3. [2024-01-14 16:45] Create API documentation (architect)
   ID: task-125 | Workspace: /project/docs

[Previous] Page 1 of 5 [Next]

Actions: (s)elect, (f)ilter, (r)efresh, (q)uit
```

### 6. Testing Requirements

1. **Unit Tests**

    - Test command parsing and validation
    - Test atom state updates
    - Test message handling

2. **Integration Tests**

    - Test full flow from command to display
    - Test pagination navigation
    - Test search and filtering
    - Test task switching

3. **Edge Cases**
    - Empty task history
    - Network/service errors
    - Invalid task IDs
    - Pagination boundaries

### 7. Future Enhancements

1. **Advanced Filtering**

    - Filter by date range
    - Filter by mode
    - Filter by status (completed/active)

2. **Bulk Operations**

    - Delete multiple tasks
    - Export task history

3. **Task Details View**

    - Show full task details
    - Display task messages
    - Show todo items

4. **Keyboard Shortcuts**
    - Quick navigation with arrow keys
    - Vim-style navigation (j/k)
    - Quick actions (Enter to select, / to search)

## Implementation Priority

1. **Phase 1: Core Functionality**

    - Basic /tasks command
    - List tasks with pagination
    - Simple task selection

2. **Phase 2: Search & Filter**

    - Search by task name
    - Sort options
    - Workspace filtering

3. **Phase 3: Enhanced UX**
    - Interactive UI with keyboard navigation
    - Task details view
    - Bulk operations

## Dependencies

- Extension must support `taskHistoryRequest` message type
- Extension must support `selectTask` message type
- Existing message bridge infrastructure
- React and Ink for TUI components

## Success Criteria

- [ ] Users can list their task history
- [ ] Users can search tasks by name
- [ ] Users can sort tasks by different criteria
- [ ] Users can navigate pages of results
- [ ] Users can select and switch to a previous task
- [ ] Error states are handled gracefully
- [ ] Performance is acceptable for large task histories
