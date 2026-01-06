# AGENTS.md Files

AGENTS.md files provide a standardized way to configure AI agent behavior across different AI coding tools. They allow you to define project-specific instructions, coding standards, and guidelines that AI agents should follow when working with your codebase.

## What is AGENTS.md?

AGENTS.md is an open standard for configuring AI agent behavior in software projects. It's a simple Markdown file placed at the root of your project that contains instructions for AI coding assistants. The standard is supported by multiple AI coding tools, including Kilo Code, Cursor, and Windsurf.

Think of AGENTS.md as a "README for AI agents" - it tells the AI how to work with your specific project, what conventions to follow, and what constraints to respect.

## Why Use AGENTS.md?

- **Portability**: Works across multiple AI coding tools without modification
- **Version Control**: Lives in your repository alongside your code
- **Team Consistency**: Ensures all team members' AI assistants follow the same guidelines
- **Project-Specific**: Tailored to your project's unique requirements and conventions
- **Simple Format**: Plain Markdown - no special syntax or configuration required

## File Location and Naming

### Project-Level AGENTS.md

Place your AGENTS.md file at the **root of your project**:

```
my-project/
├── AGENTS.md          # Primary filename (recommended)
├── src/
├── package.json
└── README.md
```

**Supported filenames** (in order of precedence):
1. `AGENTS.md` (uppercase, plural - recommended)
2. `AGENT.md` (uppercase, singular - fallback)

:::warning Case Sensitivity
The filename must be uppercase (`AGENTS.md`), not lowercase (`agents.md`). This ensures consistency across different operating systems and tools.
:::

### Subdirectory AGENTS.md Files

You can also place AGENTS.md files in subdirectories to provide context-specific instructions:

```
my-project/
├── AGENTS.md                    # Root-level instructions
├── src/
│   └── backend/
│       └── AGENTS.md            # Backend-specific instructions
└── docs/
    └── AGENTS.md                # Documentation-specific instructions
```

When working in a subdirectory, Kilo Code will load both the root AGENTS.md and any subdirectory AGENTS.md files, with subdirectory files taking precedence for conflicting instructions.

## File Protection

Both `AGENTS.md` and `AGENT.md` are **write-protected files** in Kilo Code. This means:

- The AI agent cannot modify these files without explicit user approval
- You'll be prompted to confirm any changes to these files
- This prevents accidental modifications to your project's AI configuration

## Basic Syntax and Structure

AGENTS.md files use standard Markdown syntax. There's no required structure, but organizing your content with headers and lists makes it easier for AI models to parse and understand.

### Recommended Structure

```markdown
# Project Name

Brief description of the project and its purpose.

## Code Style

- Use TypeScript for all new files
- Follow ESLint configuration
- Use 2 spaces for indentation

## Architecture

- Follow MVC pattern
- Keep components under 200 lines
- Use dependency injection

## Testing

- Write unit tests for all business logic
- Maintain >80% code coverage
- Use Jest for testing

## Security

- Never commit API keys or secrets
- Validate all user inputs
- Use parameterized queries for database access
```

## Best Practices

### Be Specific and Clear

**Bad:**
```markdown
- Write good code
- Follow best practices
```

**Good:**
```markdown
- Use TypeScript strict mode
- Limit function complexity to cyclomatic complexity < 10
- Extract functions longer than 50 lines into smaller units
```

### Use Examples

Include code examples to illustrate your guidelines:

```markdown
## Error Handling

Always use try-catch blocks for async operations:

\`\`\`typescript
async function fetchUser(id: string) {
  try {
    const user = await db.user.findUnique({ where: { id } })
    return user
  } catch (error) {
    logger.error('Failed to fetch user', { id, error })
    throw new Error('User not found')
  }
}
\`\`\`
```

### Organize by Category

Group related guidelines under clear headers:

```markdown
# Project Guidelines

## Code Style
[style guidelines]

## Architecture
[architecture guidelines]

## Testing
[testing guidelines]

## Security
[security guidelines]
```

### Keep It Concise

AI models work best with clear, concise instructions. Avoid:
- Long paragraphs of prose
- Redundant information
- Overly detailed explanations

Instead:
- Use bullet points
- Be direct and actionable
- Focus on the most important guidelines

### Update Regularly

Review and update your AGENTS.md file as your project evolves:
- Add new conventions as they're established
- Remove outdated guidelines
- Refine unclear instructions based on AI behavior

## How AGENTS.md Works in Kilo Code

### Loading Behavior

When you start a task in Kilo Code:

1. Kilo Code checks for `AGENTS.md` or `AGENT.md` at the project root
2. If found, the content is loaded and included in the AI's context
3. The AI follows these instructions throughout the conversation
4. Changes to AGENTS.md take effect in new tasks (reload may be required)

### Interaction with Other Rules

AGENTS.md works alongside Kilo Code's other configuration systems:

| Feature | Scope | Purpose | Priority |
|---------|-------|---------|----------|
| **AGENTS.md** | Project-specific | Cross-tool standard for project guidelines | Medium |
| **[Custom Rules](/agent-behavior/custom-rules)** | Project or Global | Kilo Code-specific rules and constraints | High |
| **[Custom Instructions](/agent-behavior/custom-instructions)** | Global (IDE-wide) | Personal preferences across all projects | Low |
| **[Custom Modes](/agent-behavior/custom-modes)** | Project or Global | Specialized workflows with specific permissions | Varies |

**Priority order** (highest to lowest):
1. Mode-specific Custom Rules (`.kilocode/rules-{mode}/`)
2. Project Custom Rules (`.kilocode/rules/`)
3. AGENTS.md (project root)
4. Global Custom Rules (`~/.kilocode/rules/`)
5. Custom Instructions (global settings)

### Enabling/Disabling AGENTS.md

AGENTS.md support is **enabled by default** in Kilo Code. To disable it:

1. Open VS Code Settings
2. Search for "Kilo Code: Use Agent Rules"
3. Uncheck the setting

Or in `settings.json`:

```json
{
  "kilocode.useAgentRules": false
}
```

## Multiple AGENTS.md Files (Hierarchy)

Kilo Code supports a hierarchical approach to AGENTS.md files:

### Root-Level AGENTS.md

The root-level file provides project-wide guidelines:

```
my-project/
├── AGENTS.md          # Project-wide guidelines
├── src/
└── docs/
```

### Subdirectory AGENTS.md

Subdirectory files provide context-specific instructions:

```
my-project/
├── AGENTS.md                    # General project guidelines
├── src/
│   ├── frontend/
│   │   └── AGENTS.md            # Frontend-specific guidelines
│   └── backend/
│       └── AGENTS.md            # Backend-specific guidelines
└── docs/
    └── AGENTS.md                # Documentation guidelines
```

### Precedence Rules

When multiple AGENTS.md files exist:

1. **Closest file wins**: The AGENTS.md file in the current working directory takes precedence
2. **Inheritance**: Instructions from parent directories are still applied
3. **Conflict resolution**: More specific (subdirectory) instructions override general (root) instructions

**Example:**

If you're working in `src/backend/` and both root and `src/backend/AGENTS.md` exist:
- Both files are loaded
- Instructions from `src/backend/AGENTS.md` take precedence for conflicts
- Non-conflicting instructions from both files are applied

## Related Features

- **[Custom Rules](/agent-behavior/custom-rules)** - Kilo Code-specific rules with more control
- **[Custom Modes](/agent-behavior/custom-modes)** - Specialized workflows with specific permissions
- **[Custom Instructions](/agent-behavior/custom-instructions)** - Personal preferences across all projects
- **[Migrating from Cursor or Windsurf](/advanced-usage/migrating-from-cursor-windsurf)** - Migration guide for other tools

## External Resources

- [AGENTS.md Specification](https://agents.md) - Official standard documentation
- [dotagent](https://github.com/johnlindquist/dotagent) - Universal converter tool for agent configuration files
- [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) - 700+ example rules you can adapt
