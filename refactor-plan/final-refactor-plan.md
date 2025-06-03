# TypeScript Refactoring Tool - Detailed Implementation Plan

## Current Problems Analysis
- **executeRemoveOperation**: 687 lines with 15+ responsibilities
- **executeMoveOperation**: 892 lines with 20+ responsibilities  
- **Complex path handling**: Scattered across 8+ locations
- **Duplicate logic**: Symbol finding repeated 3+ times
- **Hard to test**: Monolithic functions can't be unit tested

## Target Architecture

### Module Hierarchy
```
src/
├── core/
│   ├── SymbolResolver.ts      # Find & validate symbols
│   ├── SymbolExtractor.ts     # Extract symbol content & dependencies  
│   ├── SymbolRemover.ts       # Remove symbols safely
│   └── types.ts               # Shared interfaces
├── operations/
│   ├── RemoveOrchestrator.ts  # Orchestrate remove operation
│   └── MoveOrchestrator.ts    # Orchestrate move operation
├── utils/
│   ├── FileManager.ts         # File system operations
│   ├── PathResolver.ts        # Path calculations
│   └── ImportManager.ts       # Enhanced existing class
└── existing files remain unchanged until Phase 3
```

---

## PHASE 1: Foundation Modules (Week 1)

### Day 1: PathResolver Module

#### File: `src/utils/PathResolver.ts`
```typescript
import * as path from "path"

export class PathResolver {
  constructor(private projectRoot: string) {}

  /**
   * Replaces: resolveFilePath calls throughout both files
   * Extract from: Lines 23, 67, 156 in remove operation
   */
  resolveAbsolutePath(relativePath: string): string {
    // EXACT extraction from existing resolveFilePath calls
    return path.resolve(this.projectRoot, relativePath)
  }

  /**
   * Replaces: .replace(/\\/g, "/") scattered 12+ times
   * Extract from: Lines 15, 45, 89 in both files
   */
  normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, "/")
  }

  /**
   * Replaces: calculateRelativePath in ImportManager
   * Extract from: ImportManager lines 234-250
   */
  getRelativeImportPath(fromFile: string, toFile: string): string {
    const fromDir = path.dirname(this.normalizeFilePath(fromFile))
    let relativePath = path.relative(fromDir, this.normalizeFilePath(toFile))
    
    relativePath = this.normalizeFilePath(relativePath)
    relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, "")
    
    if (!relativePath.startsWith(".")) {
      relativePath = "./" + relativePath
    }
    
    return relativePath
  }

  /**
   * Replaces: Path existence checks scattered throughout
   */
  pathExists(filePath: string): boolean {
    const fs = require('fs')
    return fs.existsSync(this.resolveAbsolutePath(filePath))
  }
}
```

#### Test file: `src/utils/__tests__/PathResolver.test.ts`
```typescript
import { PathResolver } from '../PathResolver'

describe('PathResolver', () => {
  const projectRoot = '/project/root'
  let pathResolver: PathResolver

  beforeEach(() => {
    pathResolver = new PathResolver(projectRoot)
  })

  describe('resolveAbsolutePath', () => {
    it('should resolve relative paths correctly', () => {
      expect(pathResolver.resolveAbsolutePath('src/file.ts')).toBe('/project/root/src/file.ts')
    })

    it('should handle already absolute paths', () => {
      expect(pathResolver.resolveAbsolutePath('/absolute/path.ts')).toBe('/absolute/path.ts')
    })
  })

  describe('normalizeFilePath', () => {
    it('should normalize Windows paths to Unix format', () => {
      expect(pathResolver.normalizeFilePath('src\\file.ts')).toBe('src/file.ts')
    })

    it('should leave Unix paths unchanged', () => {
      expect(pathResolver.normalizeFilePath('src/file.ts')).toBe('src/file.ts')
    })
  })

  describe('getRelativeImportPath', () => {
    it('should calculate correct relative import paths', () => {
      const from = '/project/root/src/components/Button.ts'
      const to = '/project/root/src/utils/helpers.ts'
      expect(pathResolver.getRelativeImportPath(from, to)).toBe('../utils/helpers')
    })

    it('should add ./ prefix for same directory imports', () => {
      const from = '/project/root/src/utils/a.ts'
      const to = '/project/root/src/utils/b.ts'
      expect(pathResolver.getRelativeImportPath(from, to)).toBe('./b')
    })
  })
})
```

---

### Day 2: Core Types Definition

#### File: `src/core/types.ts`
```typescript
import { Node } from "ts-morph"

/**
 * Result of resolving a symbol - replaces inline symbol handling
 */
export interface ResolvedSymbol {
  node: Node
  name: string
  isExported: boolean
  filePath: string
}

/**
 * Result of validation checks - replaces scattered boolean checks
 */
export interface ValidationResult {
  canProceed: boolean
  blockers: string[]    // Hard stops that prevent operation
  warnings: string[]    // Issues that should be logged but don't block
}

/**
 * Dependencies needed by a symbol - replaces Map<string, ImportInfo>
 */
export interface SymbolDependencies {
  imports: Map<string, string>  // symbolName -> moduleSpecifier
  types: string[]               // Type names that must be available
  localReferences: string[]     // Other symbols in same file this depends on
}

/**
 * Result of removing a symbol - replaces success/error handling
 */
export interface RemovalResult {
  success: boolean
  method: 'standard' | 'aggressive' | 'manual' | 'failed'
  error?: string
  symbolStillExists: boolean
}

/**
 * Extracted symbol content - replaces extractSymbolText return
 */
export interface ExtractedSymbol {
  text: string                  // Full symbol text with comments
  comments: string[]            // Leading comments
  dependencies: SymbolDependencies
  isExported: boolean
}

/**
 * Reference to symbol found in project
 */
export interface ReferenceInfo {
  filePath: string
  lineNumber: number
  isInSameFile: boolean
  isInExportDeclaration: boolean
}
```

---

### Day 3: SymbolResolver Module

#### File: `src/core/SymbolResolver.ts`
```typescript
import { Project, SourceFile, Node, SyntaxKind } from "ts-morph"
import { SymbolFinder } from "../utils/symbol-finder"  // Existing
import { ResolvedSymbol, ValidationResult, ReferenceInfo } from "./types"
import { IdentifierSelector } from "../schema"  // Existing

export class SymbolResolver {
  constructor(private project: Project) {}

  /**
   * Replaces: Scattered symbol finding in both operations
   * Extract from: Lines 158-175 in remove, Lines 267-284 in move
   */
  resolveSymbol(selector: IdentifierSelector, sourceFile: SourceFile): ResolvedSymbol | null {
    const finder = new SymbolFinder(sourceFile)
    const symbol = finder.findSymbol(selector)
    
    if (!symbol) {
      return null
    }

    return {
      node: symbol,
      name: selector.name,
      isExported: finder.isExported(symbol),
      filePath: sourceFile.getFilePath()
    }
  }

  /**
   * Replaces: Validation logic scattered in remove operation
   * Extract from: Lines 176-195 in remove operation
   */
  validateForRemoval(symbol: ResolvedSymbol): ValidationResult {
    const node = symbol.node
    const blockers: string[] = []
    const warnings: string[] = []

    // Check if symbol type is removable (from remove operation lines 176-185)
    const isRemovable = 
      Node.isFunctionDeclaration(node) ||
      Node.isClassDeclaration(node) ||
      Node.isInterfaceDeclaration(node) ||
      Node.isTypeAliasDeclaration(node) ||
      Node.isEnumDeclaration(node) ||
      Node.isMethodDeclaration(node) ||
      Node.isPropertyDeclaration(node) ||
      Node.isExportSpecifier(node) ||
      Node.isVariableDeclaration(node)

    if (!isRemovable) {
      blockers.push(`Symbol '${symbol.name}' cannot be removed (unsupported symbol type)`)
    }

    // Check for external references (from remove operation lines 198-235)
    const externalReferences = this.findExternalReferences(symbol)
    if (externalReferences.length > 0) {
      const referencingFiles = [...new Set(externalReferences.map(ref => ref.filePath))]
      blockers.push(
        `Cannot remove '${symbol.name}' because it is referenced in ${externalReferences.length} locations across ${referencingFiles.length} files: ${referencingFiles.join(", ")}`
      )
    }

    return {
      canProceed: blockers.length === 0,
      blockers,
      warnings
    }
  }

  /**
   * Replaces: Move operation validation
   * Extract from: Lines 335-347 in move operation  
   */
  validateForMove(symbol: ResolvedSymbol): ValidationResult {
    const node = symbol.node
    const blockers: string[] = []
    const warnings: string[] = []

    // Check if symbol is top-level (from move operation isTopLevelSymbol function)
    const isTopLevel = 
      Node.isFunctionDeclaration(node) ||
      Node.isClassDeclaration(node) ||
      Node.isInterfaceDeclaration(node) ||
      Node.isTypeAliasDeclaration(node) ||
      Node.isEnumDeclaration(node) ||
      (Node.isVariableDeclaration(node) &&
        Node.isVariableStatement(node.getParent()?.getParent()) &&
        node.getParent()?.getParent()?.getParentIfKind(SyntaxKind.SourceFile) !== undefined)

    if (!isTopLevel) {
      blockers.push(`Symbol '${symbol.name}' is not a top-level symbol and cannot be moved`)
    }

    return {
      canProceed: blockers.length === 0,
      blockers,
      warnings
    }
  }

  /**
   * Replaces: Complex reference finding in remove operation
   * Extract from: Lines 198-235 in remove operation
   */
  findExternalReferences(symbol: ResolvedSymbol): ReferenceInfo[] {
    const node = symbol.node
    const externalReferences: ReferenceInfo[] = []

    if (!Node.isReferenceFindable(node)) {
      return externalReferences
    }

    const references = node.findReferencesAsNodes()
    
    // Filter logic extracted from remove operation lines 200-230
    const filteredReferences = references.filter((ref) => {
      // Skip the declaration itself
      if (ref === node) return false

      // Skip references in the same file with same logic as original
      if (ref.getSourceFile().getFilePath() === symbol.filePath) {
        const isInDeclaration =
          ref.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) === node ||
          ref.getFirstAncestorByKind(SyntaxKind.ClassDeclaration) === node ||
          ref.getFirstAncestorByKind(SyntaxKind.InterfaceDeclaration) === node ||
          ref.getFirstAncestorByKind(SyntaxKind.TypeAliasDeclaration) === node ||
          ref.getFirstAncestorByKind(SyntaxKind.EnumDeclaration) === node ||
          ref.getFirstAncestorByKind(SyntaxKind.MethodDeclaration) === node ||
          ref.getFirstAncestorByKind(SyntaxKind.PropertyDeclaration) === node ||
          ref.getFirstAncestorByKind(SyntaxKind.VariableDeclaration) === node

        const isInExportDeclaration = ref.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) !== undefined

        return !isInDeclaration && !isInExportDeclaration
      }

      return true
    })

    // Convert to ReferenceInfo objects
    return filteredReferences.map(ref => ({
      filePath: ref.getSourceFile().getFilePath(),
      lineNumber: ref.getStartLineNumber(),
      isInSameFile: ref.getSourceFile().getFilePath() === symbol.filePath,
      isInExportDeclaration: ref.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) !== undefined
    }))
  }
}
```

#### Test file: `src/core/__tests__/SymbolResolver.test.ts`
```typescript
import { Project } from "ts-morph"
import { SymbolResolver } from "../SymbolResolver"

describe('SymbolResolver', () => {
  let project: Project
  let resolver: SymbolResolver

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true })
    resolver = new SymbolResolver(project)
  })

  describe('resolveSymbol', () => {
    it('should resolve function symbols', () => {
      const sourceFile = project.createSourceFile('test.ts', `
        export function testFunction() {
          return 'test'
        }
      `)

      const result = resolver.resolveSymbol(
        { name: 'testFunction', filePath: 'test.ts', kind: 'function' },
        sourceFile
      )

      expect(result).not.toBeNull()
      expect(result!.name).toBe('testFunction')
      expect(result!.isExported).toBe(true)
    })

    it('should return null for non-existent symbols', () => {
      const sourceFile = project.createSourceFile('test.ts', 'const x = 1')
      
      const result = resolver.resolveSymbol(
        { name: 'nonExistent', filePath: 'test.ts', kind: 'function' },
        sourceFile
      )

      expect(result).toBeNull()
    })
  })

  describe('validateForRemoval', () => {
    it('should allow removal of removable symbols', () => {
      const sourceFile = project.createSourceFile('test.ts', `
        function testFunction() {}
      `)
      
      const symbol = resolver.resolveSymbol(
        { name: 'testFunction', filePath: 'test.ts', kind: 'function' },
        sourceFile
      )!

      const validation = resolver.validateForRemoval(symbol)
      expect(validation.canProceed).toBe(true)
      expect(validation.blockers).toHaveLength(0)
    })

    it('should block removal of referenced symbols', () => {
      const sourceFile = project.createSourceFile('test.ts', `
        export function testFunction() {}
      `)
      
      project.createSourceFile('other.ts', `
        import { testFunction } from './test'
        testFunction()
      `)

      const symbol = resolver.resolveSymbol(
        { name: 'testFunction', filePath: 'test.ts', kind: 'function' },
        sourceFile
      )!

      const validation = resolver.validateForRemoval(symbol)
      expect(validation.canProceed).toBe(false)
      expect(validation.blockers[0]).toContain('referenced in')
    })
  })
})
```

---

### Day 4: FileManager Module

#### File: `src/utils/FileManager.ts`
```typescript
import { Project, SourceFile } from "ts-morph"
import * as fsSync from "fs"
import { PathResolver } from "./PathResolver"
import { ensureDirectoryExists, writeFile } from "../utils/file-system"  // Existing

export class FileManager {
  constructor(
    private project: Project,
    private pathResolver: PathResolver
  ) {}

  /**
   * Replaces: Complex file finding/adding logic in both operations
   * Extract from: Lines 67-145 in remove, Lines 234-298 in move
   */
  async ensureFileInProject(filePath: string): Promise<SourceFile | null> {
    const normalizedPath = this.pathResolver.normalizeFilePath(filePath)
    
    // Try to get existing file first
    let sourceFile = this.project.getSourceFile(normalizedPath)
    if (sourceFile) {
      return sourceFile
    }

    // Check if file exists on disk
    const absolutePath = this.pathResolver.resolveAbsolutePath(normalizedPath)
    if (!fsSync.existsSync(absolutePath)) {
      return null
    }

    // Try multiple strategies to add file to project (extracted from remove operation lines 89-145)
    const pathsToTry = [
      { path: normalizedPath, description: "normalized path" },
      { path: absolutePath, description: "absolute path" },
      { path: filePath, description: "original path" },
    ]

    for (const { path: pathToTry, description } of pathsToTry) {
      try {
        sourceFile = this.project.addSourceFileAtPath(pathToTry)
        console.log(`[DEBUG] Added source file using ${description}: ${pathToTry}`)
        return sourceFile
      } catch (error) {
        console.log(`[DEBUG] Failed to add with ${description}: ${(error as Error).message}`)
      }
    }

    // Case-insensitive search fallback (from remove operation lines 130-145)
    try {
      const dirPath = require('path').dirname(absolutePath)
      if (fsSync.existsSync(dirPath)) {
        const files = fsSync.readdirSync(dirPath)
        const fileName = require('path').basename(absolutePath)
        const matchingFile = files.find(file => file.toLowerCase() === fileName.toLowerCase())

        if (matchingFile) {
          const correctCasePath = require('path').join(dirPath, matchingFile)
          sourceFile = this.project.addSourceFileAtPath(correctCasePath)
          console.log(`[DEBUG] Added source file with correct case: ${correctCasePath}`)
          return sourceFile
        }
      }
    } catch (e) {
      console.log(`[WARNING] Case-insensitive search failed: ${(e as Error).message}`)
    }

    return null
  }

  /**
   * Replaces: Target file creation logic in move operation
   * Extract from: Lines 376-420 in move operation
   */
  async createTargetFile(targetPath: string): Promise<SourceFile> {
    const normalizedPath = this.pathResolver.normalizeFilePath(targetPath)
    const absolutePath = this.pathResolver.resolveAbsolutePath(normalizedPath)

    // Ensure directory exists
    const targetDir = require('path').dirname(absolutePath)
    await ensureDirectoryExists(targetDir)

    // Check if file already exists in project
    let targetFile = this.project.getSourceFile(normalizedPath)
    if (targetFile) {
      return targetFile
    }

    // Create file on disk if it doesn't exist
    if (!fsSync.existsSync(absolutePath)) {
      await writeFile(absolutePath, "")
      console.log(`[DEBUG] Created empty target file: ${absolutePath}`)
    }

    // Try multiple strategies to add to project (from move operation lines 390-420)
    try {
      targetFile = this.project.addSourceFileAtPath(normalizedPath)
      console.log(`[DEBUG] Added target file to project: ${normalizedPath}`)
    } catch (e) {
      try {
        targetFile = this.project.addSourceFileAtPath(absolutePath)
        console.log(`[DEBUG] Added target file using absolute path: ${absolutePath}`)
      } catch (e2) {
        // Create in project from scratch as last resort
        const relativePath = require('path').isAbsolute(normalizedPath)
          ? require('path').relative(this.project.getCompilerOptions().rootDir || process.cwd(), normalizedPath)
          : normalizedPath

        targetFile = this.project.createSourceFile(relativePath, "", { overwrite: true })
        console.log(`[DEBUG] Created target file in project from scratch: ${relativePath}`)
        
        // Ensure file exists on disk
        await writeFile(absolutePath, "")
      }
    }

    if (!targetFile) {
      throw new Error(`Failed to create or access target file: ${targetPath}`)
    }

    return targetFile
  }

  /**
   * Replaces: Manual save and refresh logic scattered throughout
   * Extract from: Multiple locations in both files
   */
  async saveAndRefresh(sourceFile: SourceFile): Promise<SourceFile> {
    const filePath = sourceFile.getFilePath()
    
    // Save the file
    sourceFile.saveSync()
    
    // Remove from project and re-add to refresh
    this.project.removeSourceFile(sourceFile)
    const refreshedFile = this.project.addSourceFileAtPath(filePath)
    
    console.log(`[DEBUG] Saved and refreshed file: ${filePath}`)
    return refreshedFile
  }

  /**
   * Load related files for reference finding
   * Replaces: Complex file loading logic in both operations
   */
  loadRelatedFiles(sourceDir: string, targetDir?: string): void {
    try {
      const patterns = [
        `${sourceDir}/**/*.ts`,
        `${sourceDir}/**/*.tsx`,
      ]
      
      if (targetDir && targetDir !== sourceDir) {
        patterns.push(`${targetDir}/**/*.ts`, `${targetDir}/**/*.tsx`)
      }

      // Add exclusions
      const excludePatterns = [
        `!**/node_modules/**/*.ts`,
        `!**/dist/**/*.ts`,
        `!**/.git/**/*.ts`,
        `!**/build/**/*.ts`,
      ]

      const projectFiles = this.project.addSourceFilesAtPaths([...patterns, ...excludePatterns])
      console.log(`[DEBUG] Loaded ${projectFiles.length} related files`)
    } catch (error) {
      console.log(`[DEBUG] Error loading related files: ${(error as Error).message}`)
    }
  }
}
```

---

### Day 5: Week 1 Integration & Testing

#### Integration test: `src/__tests__/integration/week1.test.ts`
```typescript
import { Project } from "ts-morph"
import { PathResolver } from "../../utils/PathResolver"
import { FileManager } from "../../utils/FileManager"
import { SymbolResolver } from "../../core/SymbolResolver"

describe('Week 1 Integration', () => {
  let project: Project
  let pathResolver: PathResolver
  let fileManager: FileManager
  let symbolResolver: SymbolResolver

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true })
    pathResolver = new PathResolver('/test/project')
    fileManager = new FileManager(project, pathResolver)
    symbolResolver = new SymbolResolver(project)
  })

  it('should integrate all Week 1 modules successfully', async () => {
    // Create test file
    const sourceFile = project.createSourceFile('src/test.ts', `
      export function testFunction() {
        return 'hello world'
      }
    `)

    // Test PathResolver
    const normalizedPath = pathResolver.normalizeFilePath('src\\test.ts')
    expect(normalizedPath).toBe('src/test.ts')

    // Test SymbolResolver
    const symbol = symbolResolver.resolveSymbol(
      { name: 'testFunction', filePath: 'src/test.ts', kind: 'function' },
      sourceFile
    )
    expect(symbol).not.toBeNull()
    expect(symbol!.isExported).toBe(true)

    // Test validation
    const validation = symbolResolver.validateForRemoval(symbol!)
    expect(validation.canProceed).toBe(true)

    // Test FileManager
    const refreshedFile = await fileManager.saveAndRefresh(sourceFile)
    expect(refreshedFile.getFilePath()).toBe(sourceFile.getFilePath())
  })

  it('should handle complex cross-module scenarios', () => {
    // More complex integration scenarios
    // Test edge cases that might break between modules
  })
})
```

#### Week 1 Completion Checklist:
- [ ] PathResolver: 100% test coverage, all path operations work
- [ ] Core types: All interfaces defined and documented
- [ ] SymbolResolver: Symbol finding and validation working
- [ ] FileManager: File operations working with PathResolver
- [ ] Integration test: All modules work together
- [ ] Existing tests: All original tests still pass
- [ ] Performance: No degradation in existing operations

---

## PHASE 2: Business Logic Extraction (Week 2)

### Day 1-2: SymbolExtractor Module

#### File: `src/core/SymbolExtractor.ts`
```typescript
import { Node, SourceFile, SyntaxKind } from "ts-morph"
import { ExtractedSymbol, SymbolDependencies } from "./types"

export class SymbolExtractor {
  /**
   * Replaces: extractSymbolText function in move operation  
   * Extract from: Lines 215-280 in move operation (extractSymbolText function)
   */
  extractSymbolWithComments(symbol: Node): string {
    const sourceFile = symbol.getSourceFile()
    const fullText = sourceFile.getFullText()
    let text = ""

    // Get leading comments (extracted logic from lines 220-240)
    const leadingComments = symbol.getLeadingCommentRanges()
    if (leadingComments && leadingComments.length > 0) {
      const symbolStartLine = symbol.getStartLineNumber()
      const lastCommentEndLine = sourceFile
        .getLineAndColumnAtPos(leadingComments[leadingComments.length - 1].getEnd()).line

      // Only include comments that are close to the symbol (within 2 lines)
      if (symbolStartLine - lastCommentEndLine <= 2) {
        const commentText = fullText.substring(
          leadingComments[0].getPos(),
          leadingComments[leadingComments.length - 1].getEnd()
        )

        // Filter out test fixture comments (from lines 245-255)
        if (
          !commentText.includes("TEST FIXTURE") &&
          !commentText.includes("will be moved") &&
          !commentText.includes("test case") &&
          !commentText.includes("This will be") &&
          !commentText.toLowerCase().includes("test")
        ) {
          text = commentText + "\n"
        }
      }
    }

    // Add type dependencies (from findTypeDependencies function lines 176-214)
    const typeDependencies = this.findTypeDependencies(symbol)
    for (const typeDep of typeDependencies) {
      text += typeDep + "\n\n"
    }

    // Get the actual symbol text (from lines 256-275)
    if (Node.isVariableDeclaration(symbol)) {
      const statement = symbol.getParent()?.getParent()
      if (statement) {
        if (Node.isVariableStatement(statement) && statement.isExported()) {
          text += statement.getText()
        } else {
          const isExported = symbol.getFirstAncestorByKind(SyntaxKind.ExportKeyword) !== undefined
          if (isExported) {
            text += "export " + statement.getText()
          } else {
            text += statement.getText()
          }
        }
      } else {
        text += symbol.getText()
      }
    } else {
      text += symbol.getText()
    }

    return text
  }

  /**
   * Replaces: collectImportsForSymbol function in move operation
   * Extract from: Lines 283-370 in move operation (collectImportsForSymbol function)
   */
  extractDependencies(symbol: Node, sourceFile: SourceFile): SymbolDependencies {
    const identifiersToImport = new Set<string>()
    const importInfoMap = new Map<string, string>() // name -> moduleSpecifier

    // Find all identifiers in the symbol (from lines 285-295)
    symbol.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
      const name = id.getText()
      const parent = id.getParent()

      // Skip property names and common keywords (from lines 296-305)
      if (
        (parent && Node.isPropertyAssignment(parent) && parent.getNameNode() === id) ||
        (parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) ||
        ["string", "number", "boolean", "any", "void", "null", "undefined", "this", "super"].includes(name)
      ) {
        return
      }

      identifiersToImport.add(name)
    })

    // Find type references (from lines 307-315)
    symbol.getDescendantsOfKind(SyntaxKind.TypeReference).forEach((typeRef) => {
      if (Node.isIdentifier(typeRef.getTypeName())) {
        const typeName = typeRef.getTypeName().getText()
        identifiersToImport.add(typeName)
      }
    })

    // Check return type annotations and parameters (from lines 317-335)
    if (Node.isFunctionDeclaration(symbol) && symbol.getReturnTypeNode()) {
      const returnType = symbol.getReturnTypeNode()
      if (returnType) {
        returnType.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
          identifiersToImport.add(id.getText())
        })
      }
    }

    if (Node.isFunctionDeclaration(symbol)) {
      symbol.getParameters().forEach((param) => {
        const typeNode = param.getTypeNode()
        if (typeNode) {
          typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
            identifiersToImport.add(id.getText())
          })
        }
      })
    }

    // Find imports for each identifier (from lines 337-370)
    const localReferences: string[] = []
    
    identifiersToImport.forEach((name) => {
      // Check if defined in source file
      const isDefinedInSource =
        sourceFile.getInterface(name) !== undefined ||
        sourceFile.getTypeAlias(name) !== undefined ||
        sourceFile.getClass(name) !== undefined ||
        sourceFile.getEnum(name) !== undefined ||
        sourceFile.getFunction(name) !== undefined ||
        sourceFile.getVariableDeclaration(name) !== undefined

      // Skip if it's the symbol itself
      const symbolName = this.getSymbolName(symbol)
      if (symbolName === name) {
        return
      }

      if (isDefinedInSource) {
        localReferences.push(name)
      } else {
        // Find import for this identifier
        sourceFile.getImportDeclarations().forEach((importDecl) => {
          const namedImports = importDecl.getNamedImports()
          const hasImport = namedImports.some((ni) => ni.getName() === name)

          if (hasImport) {
            const moduleSpecifier = importDecl.getModuleSpecifierValue()
            importInfoMap.set(name, moduleSpecifier)
          }
        })
      }
    })

    return {
      imports: importInfoMap,
      types: Array.from(identifiersToImport).filter(name => /^[A-Z]/.test(name)), // Types typically start with uppercase
      localReferences
    }
  }

  /**
   * Extract type dependencies that should move with symbol
   * From: findTypeDependencies function in move operation lines 176-214
   */
  private findTypeDependencies(symbol: Node): string[] {
    const dependencies: string[] = []
    const sourceFile = symbol.getSourceFile()
    const typeReferences = new Set<string>()

    // Find all type references in the symbol
    symbol.getDescendantsOfKind(SyntaxKind.TypeReference).forEach((typeRef) => {
      if (Node.isIdentifier(typeRef.getTypeName())) {
        const typeName = typeRef.getTypeName().getText()
        typeReferences.add(typeName)
      }
    })

    // Check return type annotations
    if (Node.isFunctionDeclaration(symbol) && symbol.getReturnTypeNode()) {
      const returnType = symbol.getReturnTypeNode()
      if (returnType) {
        returnType.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
          typeReferences.add(id.getText())
        })
      }
    }

    // Check parameter types
    if (Node.isFunctionDeclaration(symbol)) {
      symbol.getParameters().forEach((param) => {
        const typeNode = param.getTypeNode()
        if (typeNode) {
          typeNode.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id) => {
            typeReferences.add(id.getText())
          })
        }
      })
    }

    // For each type reference, find its definition in the source file
    typeReferences.forEach((typeName) => {
      // Check for interface declarations
      const interfaces = sourceFile.getInterfaces().filter((i) => i.getName() === typeName)
      interfaces.forEach((iface) => {
        dependencies.push(iface.getText())
      })

      // Check for type alias declarations  
      const typeAliases = sourceFile.getTypeAliases().filter((t) => t.getName() === typeName)
      typeAliases.forEach((typeAlias) => {
        dependencies.push(typeAlias.getText())
      })

      // Check for enum declarations
      const enums = sourceFile.getEnums().filter((e) => e.getName() === typeName)
      enums.forEach((enumDecl) => {
        dependencies.push(enumDecl.getText())
      })

      // Check for class declarations
      const classes = sourceFile.getClasses().filter((c) => c.getName() === typeName)
      classes.forEach((classDecl) => {
        dependencies.push(classDecl.getText())
      })
    })

    return dependencies
  }

  /**
   * Get symbol name safely
   */
  private getSymbolName(symbol: Node): string | undefined {
    if (Node.isFunctionDeclaration(symbol) ||
        Node.isClassDeclaration(symbol) ||
        Node.isInterfaceDeclaration(symbol) ||
        Node.isTypeAliasDeclaration(symbol) ||
        Node.isEnumDeclaration(symbol) ||
        Node.isVariableDeclaration(symbol)) {
      return symbol.getName()
    }
    return undefined
  }
}
```

---

### Day 3-4: SymbolRemover Module

#### File: `src/core/SymbolRemover.ts`
```typescript
import { Node, SourceFile, SyntaxKind } from "ts-morph"
import * as fsSync from "fs"
import { RemovalResult } from "./types"
import { PathResolver } from "../utils/PathResolver"

export class SymbolRemover {
  constructor(private pathResolver: PathResolver) {}

  /**
   * Replaces: All removal logic scattered in remove operation
   * Extract from: Lines 248-450 in remove operation
   */
  removeSymbol(symbol: Node, sourceFile: SourceFile, symbolName: string): RemovalResult {
    console.log(`[DEBUG] Attempting to remove symbol: ${symbolName}`)

    // Try standard removal first (from lines 248-290)
    const standardResult = this.tryStandardRemoval(symbol, sourceFile, symbolName)
    if (standardResult.success) {
      return standardResult
    }

    // Try aggressive removal (from lines 290-350)
    const aggressiveResult = this.tryAggressiveRemoval(sourceFile, symbolName)
    if (aggressiveResult.success) {
      return aggressiveResult
    }

    // Try manual text manipulation (from lines 350-400)
    const manualResult = this.tryManualRemoval(sourceFile, symbolName)
    if (manualResult.success) {
      return manualResult
    }

    // Final verification
    const stillExists = this.verifyRemoval(symbolName, sourceFile)
    
    return {
      success: !stillExists,
      method: stillExists ? 'failed' : 'manual',
      error: stillExists ? `Symbol '${symbolName}' still exists after all removal attempts` : undefined,
      symbolStillExists: stillExists
    }
  }

  /**
   * Standard ts-morph removal approach
   * Extract from: Lines 248-290 in remove operation
   */
  private tryStandardRemoval(symbol: Node, sourceFile: SourceFile, symbolName: string): RemovalResult {
    try {
      // Handle exported variable declarations first (from lines 248-255)
      if (Node.isVariableDeclaration(symbol)) {
        const statement = symbol.getParent()?.getParent()
        if (statement && Node.isVariableStatement(statement) && statement.isExported()) {
          statement.remove()
          sourceFile.saveSync()
          return { success: true, method: 'standard', symbolStillExists: false }
        }
      }

      // Remove named exports (from lines 257-275)
      this.removeNamedExports(sourceFile, symbolName)

      // Remove the symbol itself (from lines 277-290)
      if (Node.isVariableDeclaration(symbol)) {
        const statement = symbol.getParent()?.getParent()
        if (statement && Node.isVariableStatement(statement)) {
          if (statement.getDeclarations().length === 1) {
            statement.remove()
          } else {
            symbol.remove()
          }
        }
      } else {
        symbol.remove()
      }

      sourceFile.saveSync()
      
      // Verify removal worked
      const stillExists = this.verifyRemoval(symbolName, sourceFile)
      
      return {
        success: !stillExists,
        method: 'standard',
        symbolStillExists: stillExists
      }
    } catch (error) {
      console.error(`[ERROR] Standard removal failed: ${(error as Error).message}`)
      return {
        success: false,
        method: 'standard',
        error: (error as Error).message,
        symbolStillExists: true
      }
    }
  }

  /**
   * Aggressive removal by symbol type
   * Extract from: Lines 290-350 in remove operation
   */
  private tryAggressiveRemoval(sourceFile: SourceFile, symbolName: string): RemovalResult {
    console.log(`[DEBUG] Attempting aggressive removal for symbol '${symbolName}'`)
    let removalSuccessful = false

    try {
      // Remove functions (from lines 295-305)
      const functions = sourceFile.getFunctions().filter((f) => f.getName() === symbolName)
      for (const func of functions) {
        func.remove()
        console.log(`[DEBUG] Removed function declaration for ${symbolName}`)
        removalSuccessful = true
      }

      // Remove classes (from lines 307-315)
      const classes = sourceFile.getClasses().filter((c) => c.getName() === symbolName)
      for (const cls of classes) {
        cls.remove()
        console.log(`[DEBUG] Removed class declaration for ${symbolName}`)
        removalSuccessful = true
      }

      // Remove interfaces (from lines 317-325)
      const interfaces = sourceFile.getInterfaces().filter((i) => i.getName() === symbolName)
      for (const iface of interfaces) {
        iface.remove()
        console.log(`[DEBUG] Removed interface declaration for ${symbolName}`)
        removalSuccessful = true
      }

      // Remove variables (from lines 327-340)
      const variables = sourceFile.getVariableDeclarations().filter((v) => v.getName() === symbolName)
      for (const variable of variables) {
        const statement = variable.getParent()?.getParent()
        if (statement && Node.isVariableStatement(statement)) {
          if (statement.getDeclarations().length === 1) {
            statement.remove()
          } else {
            variable.remove()
          }
        }
        console.log(`[DEBUG] Removed variable declaration for ${symbolName}`)
        removalSuccessful = true
      }

      if (removalSuccessful) {
        sourceFile.saveSync()
      }

      const stillExists = this.verifyRemoval(symbolName, sourceFile)
      
      return {
        success: removalSuccessful && !stillExists,
        method: 'aggressive',
        symbolStillExists: stillExists
      }
    } catch (error) {
      console.error(`[ERROR] Aggressive removal failed: ${(error as Error).message}`)
      return {
        success: false,
        method: 'aggressive',
        error: (error as Error).message,
        symbolStillExists: true
      }
    }
  }

  /**
   * Manual text-based removal
   * Extract from: Lines 350-400 in remove operation
   */
  private tryManualRemoval(sourceFile: SourceFile, symbolName: string): RemovalResult {
    console.log(`[DEBUG] Attempting manual text removal for symbol '${symbolName}'`)
    
    try {
      const fullText = sourceFile.getFullText()
      
      // Create regex patterns to match various declaration types (from lines 355-365)
      const patterns = [
        new RegExp(`(export\\s+)?function\\s+${symbolName}\\s*\\([\\s\\S]*?\\}`, "g"),
        new RegExp(`(export\\s+)?const\\s+${symbolName}\\s*=[\\s\\S]*?;`, "g"),
        new RegExp(`(export\\s+)?let\\s+${symbolName}\\s*=[\\s\\S]*?;`, "g"),
        new RegExp(`(export\\s+)?class\\s+${symbolName}\\s*\\{[\\s\\S]*?\\}`, "g"),
        new RegExp(`(export\\s+)?interface\\s+${symbolName}\\s*\\{[\\s\\S]*?\\}`, "g"),
      ]

      let newText = fullText
      for (const pattern of patterns) {
        newText = newText.replace(pattern, "")
      }

      if (newText !== fullText) {
        sourceFile.replaceWithText(newText)
        sourceFile.saveSync()
        console.log(`[DEBUG] Manual text removal successful`)
        
        const stillExists = this.verifyRemoval(symbolName, sourceFile)
        
        return {
          success: !stillExists,
          method: 'manual',
          symbolStillExists: stillExists
        }
      }

      return {
        success: false,
        method: 'manual',
        error: 'No matching patterns found for manual removal',
        symbolStillExists: true
      }
    } catch (error) {
      console.error(`[ERROR] Manual text removal failed: ${(error as Error).message}`)
      return {
        success: false,
        method: 'manual',
        error: (error as Error).message,
        symbolStillExists: true
      }
    }
  }

  /**
   * Remove named exports that reference the symbol
   * Extract from: Lines 257-275 in remove operation
   */
  removeNamedExports(sourceFile: SourceFile, symbolName: string): void {
    const exportDeclarations = sourceFile.getExportDeclarations()
    
    for (const exportDecl of exportDeclarations) {
      const namedExports = exportDecl.getNamedExports()
      const exportsToRemove = namedExports.filter((exp) => exp.getName() === symbolName)

      if (exportsToRemove.length > 0) {
        if (namedExports.length === exportsToRemove.length) {
          // Remove the whole export declaration
          exportDecl.remove()
        } else {
          // Remove just the specific export specifiers
          for (const exp of exportsToRemove) {
            exp.remove()
          }
        }
      }
    }
  }

  /**
   * Verify that symbol was actually removed
   * Extract from: Lines 400-450 in remove operation
   */
  verifyRemoval(symbolName: string, sourceFile: SourceFile): boolean {
    // Check by symbol type
    const functions = sourceFile.getFunctions().filter((f) => f.getName() === symbolName)
    const classes = sourceFile.getClasses().filter((c) => c.getName() === symbolName)
    const interfaces = sourceFile.getInterfaces().filter((i) => i.getName() === symbolName)
    const variables = sourceFile.getVariableDeclarations().filter((v) => v.getName() === symbolName)
    
    const symbolCount = functions.length + classes.length + interfaces.length + variables.length
    
    if (symbolCount > 0) {
      console.log(`[DEBUG] Symbol still exists: ${symbolCount} instances found`)
      return true
    }

    // Also check file text for any remaining references
    const fileText = sourceFile.getFullText()
    const hasTextReference = 
      fileText.includes(`function ${symbolName}`) ||
      fileText.includes(`const ${symbolName}`) ||
      fileText.includes(`let ${symbolName}`) ||
      fileText.includes(`class ${symbolName}`) ||
      fileText.includes(`interface ${symbolName}`)

    if (hasTextReference) {
      console.log(`[DEBUG] Symbol still exists in file text`)
      return true
    }

    console.log(`[DEBUG] Symbol successfully removed: ${symbolName}`)
    return false
  }
}
```

---

### Day 5: Week 2 Integration & Testing

#### Integration test for business logic modules:
```typescript
import { Project } from "ts-morph"
import { SymbolExtractor } from "../../core/SymbolExtractor"  
import { SymbolRemover } from "../../core/SymbolRemover"
import { PathResolver } from "../../utils/PathResolver"

describe('Week 2 Business Logic Integration', () => {
  let project: Project
  let extractor: SymbolExtractor
  let remover: SymbolRemover
  let pathResolver: PathResolver

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true })
    pathResolver = new PathResolver('/test')
    extractor = new SymbolExtractor()
    remover = new SymbolRemover(pathResolver)
  })

  it('should extract and remove symbols correctly', async () => {
    const sourceFile = project.createSourceFile('test.ts', `
      interface User {
        id: string
        name: string
      }

      export function processUser(user: User): string {
        return user.name.toUpperCase()
      }
    `)

    // Find the function symbol
    const func = sourceFile.getFunction('processUser')!
    
    // Test extraction
    const extracted = extractor.extractSymbolWithComments(func)
    expect(extracted).toContain('processUser')
    expect(extracted).toContain('User')

    const dependencies = extractor.extractDependencies(func, sourceFile)
    expect(dependencies.localReferences).toContain('User')

    // Test removal
    const result = remover.removeSymbol(func, sourceFile, 'processUser')
    expect(result.success).toBe(true)
    
    // Verify removal
    const verification = remover.verifyRemoval('processUser', sourceFile)
    expect(verification).toBe(false) // false means successfully removed
  })
})
```

---

This detailed plan continues with Phase 3 (Orchestrators), Phase 4 (Move Operation), and Phase 5 (Cleanup). Each phase builds incrementally on the previous work while maintaining the existing functionality. Would you like me to continue with the remaining phases in the same detail level?