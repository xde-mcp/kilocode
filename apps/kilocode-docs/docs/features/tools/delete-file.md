# delete_file

The `delete_file` tool safely removes files and directories from the workspace with user confirmation. It provides a cross-platform alternative to shell commands like `rm` and `rm -rf` with built-in safety features.

## Parameters

The tool accepts this parameter:

- `path` (required): The relative path to the file or directory to delete from the current working directory

## What It Does

This tool deletes a specified file or directory from the workspace after receiving user confirmation. For directories, it performs comprehensive validation of all contained files before deletion. It provides a safer, platform-independent alternative to executing shell delete commands directly.

## When is it used?

- When Kilo Code needs to remove temporary or generated files
- When cleaning up old files during refactoring
- When removing outdated configuration files
- When deleting test files that are no longer needed
- When removing files as part of a larger file reorganization task
- **When deleting entire directories** such as `build/`, `dist/`, or temporary folders
- **When cleaning up empty directories** after moving files elsewhere

## Key Features

- **User Confirmation**: Requires explicit user approval before deleting any file or directory
- **Directory Summary**: Shows file count, subdirectory count, and total size before directory deletion
- **Comprehensive Validation**: For directories, validates ALL contained files against protection and ignore rules
- **Smart Blocking**: Prevents deletion if ANY file inside a directory is protected or ignored
- **Protected Pattern Support**: Respects RooProtectedController patterns including `.git/**`, `.kilocode/**`, `.vscode/**`
- **Workspace Safety**: Only allows deletion of files and directories within the workspace boundaries
- **Cross-Platform**: Works consistently across all operating systems (Windows, macOS, Linux)
- **Access Control**: Respects `.kilocodeignore` restrictions and file permissions
- **Error Handling**: Provides clear error messages if deletion fails or target doesn't exist

## Limitations

- **Single Target Only**: Cannot delete multiple files or directories in one operation
- **Workspace Boundary**: Cannot delete files or directories outside the workspace directory
- **Protected Content**: Cannot delete files blocked by `.kilocodeignore` or protected patterns
- **Protected Directory Validation**: Cannot delete directories containing protected files (via RooProtectedController)
- **Interactive Only**: Requires user confirmation, cannot be used in automated workflows
- **No Partial Deletion**: For directories, if ANY file is protected/blocked, the entire operation is blocked

## How It Works

When the `delete_file` tool is invoked, it follows this process:

1. **Parameter Validation**: Validates the required `path` parameter

    - Checks that the path is provided
    - Ensures the path is properly formatted
    - Validates it's a relative path within the workspace

2. **Path Resolution**: Resolves the relative path to an absolute path

    - Converts the relative path to an absolute workspace path
    - Verifies the target exists at the specified location
    - Determines if the path points to a file or directory

3. **Access Control Check**:

    - For files: Validates the file is not restricted by `.kilocodeignore` rules or protected patterns
    - For directories: Recursively validates ALL contained files against protection and ignore rules
    - Ensures the target is within workspace boundaries
    - Verifies user has permission to delete the target

4. **User Confirmation**:

    - For files: Presents the file path to the user for confirmation
    - For directories: Shows detailed summary (file count, subdirectory count, total size)
    - Waits for explicit user approval to proceed
    - Allows user to cancel the deletion operation

5. **Deletion**:

    - Deletes the file or directory from the filesystem if approved
    - For directories: Recursively removes all contents
    - Provides confirmation of successful deletion with details

6. **Error Handling**:
    - Reports if target doesn't exist
    - Indicates if any files are protected or inaccessible
    - Shows clear error messages for any failure conditions
    - For directories: Lists specific files that are blocking deletion

## Directory Deletion

### Overview

The `delete_file` tool can safely delete directories (folders) with enhanced validation and user confirmation. When deleting directories, the tool:

1. **Recursively scans** all files and subdirectories
2. **Validates** every file against protection and ignore rules
3. **Displays summary** showing file count, subdirectory count, and total size
4. **Blocks deletion** if ANY file inside is protected or ignored
5. **Requires approval** with detailed information before proceeding

### Safety Features for Directories

- **Recursive Validation**: Every file within the directory is checked for:

    - Write protection (via [`RooProtectedController`](src/core/protect/RooProtectedController.ts:45))
    - Access restrictions (via [`RooIgnoreController`](src/core/ignore/RooIgnoreController.ts:89))
    - Workspace boundaries

- **Protected Pattern Blocking**: Automatically blocks deletion of directories containing files matching protected patterns:

    - `.git/**` - Git repository metadata
    - `.kilocode/**` - Kilo Code configuration
    - `.vscode/**` - VSCode settings
    - `.roo/**` - Roo configuration files
    - And other patterns defined in RooProtectedController

- **Summary Display**: Before deletion, shows:

    - 📁 Number of subdirectories
    - 📄 Number of files
    - 💾 Total size

- **All-or-Nothing**: If ANY file cannot be deleted (protected, ignored, or restricted), the entire directory deletion is blocked with a clear explanation of which files are blocking.

### Empty vs Non-Empty Directories

**Empty directories:**

- Fast validation (no recursive scan needed)
- Minimal safety checks
- Simple confirmation message

**Non-empty directories:**

- Full recursive scan and validation
- Comprehensive safety checks on all files
- Detailed summary in confirmation message

### Blocked Deletion Examples

#### Protected Files

If a directory contains protected files:

```
❌ Cannot delete directory: src/config/

Blocking issues:
  🛡️  2 protected file(s):
      - .kilocode/config.json
      - .vscode/settings.json
```

#### Ignored Files

If a directory contains files blocked by `.kilocodeignore`:

```
❌ Cannot delete directory: src/data/

Blocking issues:
  🔒 1 file(s) blocked by .kilocodeignore:
      - data/secrets.json
```

#### Protected Directories

If attempting to delete a directory containing protected files:

```
❌ Cannot delete directory - contains protected file: .git/config

The directory cannot be deleted because it contains files protected by RooProtectedController.
```

## Examples When Used

- When refactoring code, Kilo Code might delete deprecated files after migrating their functionality to new modules.
- When cleaning up a project, Kilo Code removes temporary files, build directories, or build artifacts that are no longer needed.
- When implementing new features, Kilo Code might delete old test files before creating new ones with updated test cases.
- When reorganizing file structure, Kilo Code deletes files or empty directories from old locations after copying them to new locations.
- When clearing build outputs, Kilo Code removes entire `dist/` or `build/` directories before rebuilding.

## Usage Examples

Here are several scenarios demonstrating how the `delete_file` tool is used for both files and directories.

### Deleting a Directory

To delete a non-empty directory:

**Input:**

```xml
<delete_file>
<path>temp_build</path>
</delete_file>
```

**Expected Flow:**

1. Tool scans directory recursively
2. Validates all files can be deleted
3. User receives confirmation prompt with summary:

```
Delete directory: temp_build/

Summary:
  📁 2 subdirectories
  📄 8 files
  💾 145 KB total

⚠️  This action cannot be undone.
```

4. User approves the deletion
5. Directory and all contents are removed
6. Confirmation message: `Deleted directory: temp_build (8 files, 2 subdirectories)`

### Deleting an Empty Directory

To delete an empty directory:

**Input:**

```xml
<delete_file>
<path>old_folder</path>
</delete_file>
```

**Expected Flow:**

1. Tool detects directory is empty
2. User receives simple confirmation
3. Directory is removed
4. Confirmation message: `Deleted empty directory: old_folder`

### Deleting a Single File

To delete a temporary file:

**Input:**

```xml
<delete_file>
<path>temp/old_file.txt</path>
</delete_file>
```

**Expected Flow:**

1. User receives confirmation prompt showing the file path
2. User approves the deletion
3. File is removed from the filesystem
4. Confirmation message is returned

### Deleting a Configuration File

To remove an outdated configuration file:

**Input:**

```xml
<delete_file>
<path>config/deprecated-settings.json</path>
</delete_file>
```

**Expected Flow:**

1. Tool validates the file exists
2. User confirms the deletion
3. Configuration file is removed
4. Success message is returned

### Deleting a Test File

To remove an old test file during refactoring:

**Input:**

```xml
<delete_file>
<path>src/__tests__/old-component.test.ts</path>
</delete_file>
```

**Expected Flow:**

1. Path is validated within workspace
2. User approves deletion
3. Test file is removed
4. Confirmation provided

### Attempting to Delete a Non-Existent File

If the specified file does not exist:

**Input:**

```xml
<delete_file>
<path>non_existent_file.txt</path>
</delete_file>
```

**Expected Output (Error):**

```
Error: File not found at path 'non_existent_file.txt'.
```

### Attempting to Delete a Protected File

If the file is blocked by `.kilocodeignore` rules:

**Input:**

```xml
<delete_file>
<path>.env</path>
</delete_file>
```

**Expected Output (Error):**

```
Error: Access denied to file '.env' due to .kilocodeignore rules.
```

## Best Practices

When using the `delete_file` tool:

**For Files:**

- **Verify First**: Use `list_files` or `read_file` to confirm the file exists before attempting deletion
- **Single Operations**: Delete files one at a time rather than attempting batch operations
- **Document Changes**: Explain to the user why a file is being deleted
- **Check Dependencies**: Ensure no other files depend on the file being deleted
- **Consider Alternatives**: For temporary cleanup, consider if the file could be modified instead of deleted

**For Directories:**

- **Check Contents First**: Use `list_files` with `recursive: true` to see what's inside before deletion
- **Verify Empty State**: For expected empty directories, confirm they are actually empty
- **Consider Impact**: Large directory deletions (>100 files) should be carefully considered
- **Protected Paths**: Be aware that directories containing protected files (`.git/**`, `.kilocode/**`, `.vscode/**`) will be automatically blocked
- **Alternative Approaches**: For `node_modules`, consider explaining to the user they can run `npm install` to restore instead of deleting
- **Backup Reminder**: For important directories, suggest the user should have backups before proceeding
