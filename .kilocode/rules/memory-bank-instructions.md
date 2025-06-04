# Memory Bank

I rely ENTIRELY on my Memory Bank to understand projects and continue work effectively. I MUST read ALL memory bank files at the start of EVERY task. The memory bank files are located in `.kilocode/rules/memory-bank` folder.

I will include `[Memory Bank: Active]` at the beginning of responses if I successfully read the memory bank files, or `[Memory Bank: Missing]` if missing.

## Memory Bank Structure

### Core Files (Required)
1. `brief.md` - Project overview (manually maintained by developer)
2. `product.md` - Why project exists, problems it solves, how it works
3. `context.md` - Current work focus, recent changes, next steps (short and factual)
4. `architecture.md` - System architecture, source code paths, key technical decisions
5. `tech.md` - Technologies used, development setup, technical constraints

### Additional Files
Create additional files when they help organize:
- `tasks.md` - Documentation of repetitive tasks and workflows
- Complex feature documentation
- Integration specifications

## Core Workflows

### Memory Bank Initialization
When user requests **"initialize memory bank"**, perform exhaustive analysis including:
- All source code files and relationships
- Configuration files and build system setup
- Project structure and organization patterns
- Dependencies and external integrations
- Testing frameworks and patterns

After initialization, ask user to verify accuracy and encourage corrections.

### Memory Bank Update
Updates occur when:
1. Discovering new project patterns
2. After implementing significant changes
3. When user explicitly requests with **"update memory bank"** (MUST review ALL files)
4. When context needs clarification

### Add Task
When user requests **"add task"** or **"store this as a task"**, document in `tasks.md`:
- Task name and description
- Files that need modification
- Step-by-step workflow
- Important considerations
- Example implementation

### Regular Task Execution
At start of EVERY task:
1. Read ALL memory bank files
2. Briefly summarize understanding to confirm alignment
3. Follow documented workflows when task matches `tasks.md`
4. Update `context.md` when task completes
5. Suggest memory bank updates for significant changes

## Context Window Management
When context fills up:
1. Suggest updating memory bank to preserve state
2. Recommend starting fresh conversation
3. In new conversation, automatically load memory bank files

## Important Notes
Memory Bank is my only link to previous work. It must be maintained with precision and clarity.
If inconsistencies detected, prioritize `brief.md` and note discrepancies.