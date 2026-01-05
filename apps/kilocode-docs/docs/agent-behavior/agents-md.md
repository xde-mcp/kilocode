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

## Practical Examples

### Example 1: React Project Standards

```markdown
# React Project Guidelines

## Component Structure

- Use functional components with hooks
- Keep components under 150 lines
- Extract complex logic into custom hooks
- Place components in `src/components/`

## Styling

- Use Tailwind CSS for styling
- Avoid inline styles
- Use CSS modules for component-specific styles

## State Management

- Use React Context for global state
- Use local state for component-specific data
- Avoid prop drilling - use context when passing props through 3+ levels

## File Naming

- Components: PascalCase (e.g., `UserProfile.tsx`)
- Hooks: camelCase with 'use' prefix (e.g., `useAuth.ts`)
- Utils: camelCase (e.g., `formatDate.ts`)
```

### Example 2: Backend API Standards

```markdown
# Backend API Guidelines

## API Design

- Follow RESTful conventions
- Use plural nouns for endpoints (e.g., `/users`, not `/user`)
- Version APIs with `/v1/`, `/v2/` prefixes
- Return consistent error responses

## Error Handling

- Use HTTP status codes correctly:
  - 200: Success
  - 201: Created
  - 400: Bad Request
  - 401: Unauthorized
  - 404: Not Found
  - 500: Internal Server Error
- Include error messages in response body
- Log all errors with stack traces

## Database

- Use Prisma ORM for database access
- Always use transactions for multi-step operations
- Index frequently queried fields
- Use soft deletes (deletedAt field) instead of hard deletes

## Security

- Validate all inputs with Zod schemas
- Use JWT for authentication
- Rate limit all public endpoints
- Sanitize user inputs to prevent SQL injection
```

### Example 3: Security-Focused Project

```markdown
# Security Guidelines

## Restricted Files

The following files contain sensitive data and MUST NOT be read or modified:

- `.env`
- `.env.local`
- `config/secrets.json`
- `credentials/*.key`
- Any file in `private/` directory

## Code Security

- Never log sensitive information (passwords, tokens, API keys)
- Use environment variables for all secrets
- Validate and sanitize all user inputs
- Use prepared statements for database queries
- Implement rate limiting on all API endpoints

## Dependencies

- Only use dependencies from npm with >1000 weekly downloads
- Check for known vulnerabilities before adding new dependencies
- Keep all dependencies up to date
- Review dependency licenses for compatibility
```

### Example 4: Documentation Standards

```markdown
# Documentation Standards

## Code Comments

- Write JSDoc comments for all public functions
- Include parameter types and return types
- Provide usage examples for complex functions
- Explain "why" not "what" in comments

## README Files

- Every module should have a README.md
- Include:
  - Purpose and overview
  - Installation instructions
  - Usage examples
  - API documentation
  - Contributing guidelines

## Commit Messages

- Use conventional commits format:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `refactor:` for code refactoring
  - `test:` for test changes
- Keep first line under 72 characters
- Provide detailed description in commit body
```

### Example 5: Testing Requirements

```markdown
# Testing Guidelines

## Test Coverage

- Maintain minimum 80% code coverage
- 100% coverage for critical business logic
- Test all edge cases and error conditions

## Test Structure

- Use Arrange-Act-Assert pattern
- One assertion per test when possible
- Use descriptive test names: `should return error when user not found`
- Group related tests with `describe` blocks

## Test Files

- Place tests next to source files: `user.service.ts` → `user.service.spec.ts`
- Use `.spec.ts` for unit tests
- Use `.test.ts` for integration tests
- Use `.e2e.ts` for end-to-end tests

## Mocking

- Mock external dependencies (APIs, databases)
- Use test fixtures for complex data
- Reset mocks between tests
- Avoid mocking internal modules
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

## Common Use Cases

### Framework-Specific Guidelines

```markdown
# Next.js Project Guidelines

## Routing

- Use App Router (not Pages Router)
- Place routes in `app/` directory
- Use Server Components by default
- Add 'use client' only when needed

## Data Fetching

- Use Server Components for data fetching
- Use React Server Actions for mutations
- Implement loading.tsx for loading states
- Implement error.tsx for error handling
```

### Monorepo Configuration

```markdown
# Monorepo Guidelines

## Package Structure

- Place shared code in `packages/`
- Place applications in `apps/`
- Each package must have its own README.md
- Use workspace protocol for internal dependencies

## Naming Conventions

- Packages: `@company/package-name`
- Apps: `app-name`
- Shared utilities: `@company/utils-*`

## Dependencies

- Shared dependencies go in root package.json
- Package-specific dependencies in package's package.json
- Use exact versions for internal packages
```

### Open Source Project

```markdown
# Contributing Guidelines for AI Agents

## Code Contributions

- Follow the existing code style
- Add tests for all new features
- Update documentation for API changes
- Keep commits atomic and well-described

## Pull Requests

- Reference related issues
- Include screenshots for UI changes
- Ensure all tests pass
- Update CHANGELOG.md

## License

- All contributions must be compatible with MIT license
- Do not include code from incompatible licenses
- Add license headers to new files
```

## Troubleshooting

### AGENTS.md Not Loading

**Check filename:**
```bash
# Must be uppercase
ls -la AGENTS.md    # ✓ Correct
ls -la agents.md    # ✗ Wrong
```

**Check location:**
```bash
# Must be at project root
pwd                 # Should show project root
ls -la AGENTS.md    # Should exist here
```

**Check setting:**
1. Open VS Code Settings
2. Search for "Use Agent Rules"
3. Ensure it's enabled (checked)

**Reload VS Code:**
- Press `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)
- Or: Command Palette → "Developer: Reload Window"

### Instructions Not Being Followed

**Make instructions more specific:**
- Use concrete examples
- Be explicit about requirements
- Use imperative language ("Use X" not "You should use X")

**Check for conflicts:**
- Review Custom Rules that might override AGENTS.md
- Check Custom Instructions for conflicting guidance
- Verify mode-specific rules aren't contradicting AGENTS.md

**Simplify complex instructions:**
- Break long paragraphs into bullet points
- Remove redundant information
- Focus on the most critical guidelines

### File Protection Issues

If you need to modify AGENTS.md:

1. The AI will ask for approval before making changes
2. Review the proposed changes carefully
3. Approve or reject the modification
4. Consider editing the file manually if you prefer direct control

## Migrating from Other Tools

If you're coming from another AI coding tool:

### From Cursor

Cursor uses `.cursorrules` files. To migrate:

```bash
# If you have .cursorrules, it works in Kilo Code
# But consider creating AGENTS.md for cross-tool compatibility
cp .cursorrules AGENTS.md
```

See the [Migrating from Cursor or Windsurf](/advanced-usage/migrating-from-cursor-windsurf) guide for details.

### From Windsurf

Windsurf uses `.windsurfrules` files. To migrate:

```bash
# If you have .windsurfrules, it works in Kilo Code
# But consider creating AGENTS.md for cross-tool compatibility
cp .windsurfrules AGENTS.md
```

See the [Migrating from Cursor or Windsurf](/advanced-usage/migrating-from-cursor-windsurf) guide for details.

### Creating AGENTS.md from Scratch

If you don't have existing rules:

1. Start with your most important guidelines (3-5 items)
2. Add examples for clarity
3. Expand over time as patterns emerge
4. Review and refine based on AI behavior

## Advanced Topics

### Combining with Custom Modes

Use AGENTS.md for general guidelines and Custom Modes for specialized workflows:

**AGENTS.md** (general project guidelines):
```markdown
# Project Guidelines

- Use TypeScript
- Follow ESLint rules
- Write tests for all features
```

**Custom Mode** (specialized workflow):
```yaml
# .kilocodemodes
- slug: review
  name: Code Review
  roleDefinition: You review code and suggest improvements
  groups:
    - read
    - ask
```

**Mode-specific rules** (`.kilocode/rules-review/`):
```markdown
# Code Review Guidelines

- Check for security vulnerabilities
- Verify test coverage
- Suggest performance improvements
- Ensure documentation is updated
```

### Template Variables

While AGENTS.md doesn't support template variables directly, you can use placeholders that you manually update:

```markdown
# Project: [PROJECT_NAME]
Version: [VERSION]
Last Updated: [DATE]

## Guidelines
[Your guidelines here]
```

### Conditional Instructions

Use clear section headers to provide context-specific instructions:

```markdown
## For New Features

- Write tests first (TDD)
- Update API documentation
- Add changelog entry

## For Bug Fixes

- Add regression test
- Reference issue number in commit
- Update affected documentation
```

## Related Features

- **[Custom Rules](/agent-behavior/custom-rules)** - Kilo Code-specific rules with more control
- **[Custom Modes](/agent-behavior/custom-modes)** - Specialized workflows with specific permissions
- **[Custom Instructions](/agent-behavior/custom-instructions)** - Personal preferences across all projects
- **[Migrating from Cursor or Windsurf](/advanced-usage/migrating-from-cursor-windsurf)** - Migration guide for other tools

## External Resources

- [AGENTS.md Specification](https://agents.md) - Official standard documentation
- [dotagent](https://github.com/johnlindquist/dotagent) - Universal converter tool for agent configuration files
- [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) - 700+ example rules you can adapt

## Summary

AGENTS.md provides a simple, portable way to configure AI agent behavior for your projects:

- ✅ **Simple**: Plain Markdown, no special syntax
- ✅ **Portable**: Works across multiple AI coding tools
- ✅ **Version Controlled**: Lives in your repository
- ✅ **Team-Friendly**: Ensures consistent AI behavior across your team
- ✅ **Flexible**: Supports project-wide and context-specific instructions

Start with a simple AGENTS.md file containing your most important guidelines, and expand it over time as your project evolves.
