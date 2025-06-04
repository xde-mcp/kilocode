# Product: RefactorCodeTool

## Purpose
AST-based code refactoring system for 3KiloCode extension. Automates symbol moving, renaming, and removal across files with import/export management.

## How It Works
Three-phase pattern: Validation → Execution → Verification
- **Move**: Transfer symbols between files with automatic import handling
- **Rename**: Rename symbols with project-wide reference updating  
- **Remove**: Safe symbol removal with dependency cleanup

## Key Value
- Eliminates manual refactoring overhead
- Prevents human errors in complex operations
- Handles import dependencies automatically
- Supports batch operations with rollback