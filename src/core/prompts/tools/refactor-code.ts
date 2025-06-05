import { ToolArgs } from "./types"

export function getRefactorCodeDescription(_args: ToolArgs): string {
	return `## refactor_code
Description: Request to perform batch code refactoring operations on TypeScript/JavaScript files using an AST-based approach. This tool provides automated refactoring capabilities for renaming symbols, moving code between files, and removing code elements - all while properly handling dependencies and references.

Parameters:
- operations: (required) A JSON array of refactoring operations to execute. MUST be a valid JSON array, even for batch operations with a single operation.

Example usage:
\`\`\`
<refactor_code>
<operations>
[
  {
    "operation": "rename",
    "selector": {
      "type": "identifier",
      "name": "calculateTotal",
      "kind": "function",
      "filePath": "src/utils/math.ts"
    },
    "newName": "computeSum",
    "reason": "More descriptive name for the operation"
  }
]
</operations>
</refactor_code>
\`\`\`

## Available Operations

The refactor_code tool supports the following operations that MUST be executed as part of a batch (array):

### 1. Rename
Rename a symbol (function, class, variable, etc.) and update all references.

### 2. Move
Move a symbol from one file to another, updating imports across the codebase.

### 3. Remove
Remove a symbol and clean up any references to it.

## Required Response Format

All operations must be provided as an array, even for batches with a single operation. Each operation requires specific fields:

### rename
\`\`\`json
{
  "operation": "rename",
  "selector": {
    "type": "identifier",
    "name": "oldName",
    "kind": "function|class|variable|type|interface|method|property",
    "filePath": "path/to/file.ts",
    "scope": {
      "type": "class|interface|function|namespace",
      "name": "scopeName"
    }
  },
  "newName": "newName",
  "reason": "Why this change is needed"
}
\`\`\`

**Note**: The \`scope\` field is optional and used for finding symbols within specific scopes:
- For methods/constructors within classes: \`"scope": {"type": "class", "name": "ClassName"}\`
- For variables within functions: \`"scope": {"type": "function", "name": "functionName"}\`
- For interface members: \`"scope": {"type": "interface", "name": "InterfaceName"}\`

### move
\`\`\`json
{
  "operation": "move",
  "selector": {
    "type": "identifier",
    "name": "functionName",
    "kind": "function|class|variable|type|interface",
    "filePath": "source/path.ts"
  },
  "targetFilePath": "destination/path.ts",
  "reason": "Why this change is needed"
}
\`\`\`

### remove
\`\`\`json
{
  "operation": "remove",
  "selector": {
    "type": "identifier",
    "name": "unusedFunction",
    "kind": "function|class|variable|type|interface|method|property",
    "filePath": "path/to/file.ts"
  },
  "reason": "Why this removal is safe"
}
\`\`\`

## Safety Guidelines

1. ALWAYS provide the "reason" field to explain why the refactoring is needed
2. ALL operations must be provided as part of a batch array
3. Remove operations require special caution as they can affect code functionality
4. Batch operations are executed as a transaction - if any operation fails, all changes are rolled back
`
}
