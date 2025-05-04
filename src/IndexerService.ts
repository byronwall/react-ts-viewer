import * as vscode from "vscode";
import {
  Project,
  SourceFile,
  SyntaxKind,
  FunctionDeclaration,
  ClassDeclaration,
  VariableStatement,
  VariableDeclaration,
  Node,
  Identifier,
  JsxOpeningElement,
  JsxSelfClosingElement,
  CallExpression,
  ImportDeclaration,
  ImportSpecifier,
} from "ts-morph";
import {
  ComponentNode,
  HookNode,
  FileNode,
  ImportData,
  SymbolLocation,
  HookUsage,
  DependencyInfo,
} from "./types";
import * as path from "path";

// Event emitter for index updates
const _onDidIndexFile = new vscode.EventEmitter<string>(); // Emitter type
export const onDidIndexFile = _onDidIndexFile.event; // Exposed event

// Simple heuristic to check if a function/class name looks like a React component
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

// Simple heuristic to check if a function name looks like a custom hook
function isHookName(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

// Helper to create a SymbolLocation from a ts-morph Node
function getNodeLocation(node: Node): SymbolLocation {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndColumnAtPos(node.getStart());
  const end = sourceFile.getLineAndColumnAtPos(node.getEnd());
  return {
    uri: vscode.Uri.file(sourceFile.getFilePath()),
    range: new vscode.Range(
      new vscode.Position(start.line - 1, start.column - 1),
      new vscode.Position(end.line - 1, end.column - 1)
    ),
  };
}

// Helper function to check if a module specifier is likely an external library
function isExternalLibrary(moduleSpecifier: string): boolean {
  // Basic check: does not start with '.' or '/'
  return !moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/");
}

export class IndexerService {
  private project: Project;
  private indexedData: Map<string, FileNode> = new Map(); // Store indexed data
  private importResolverCache: Map<string, Map<string, ImportData>> = new Map(); // Cache resolved imports per file

  // Add an emitter for internal use within the class if preferred
  private _onIndexUpdateEmitter = new vscode.EventEmitter<void>();
  public readonly onIndexUpdate = this._onIndexUpdateEmitter.event;

  constructor() {
    // Initialize ts-morph project. Consider options like tsconfig path.
    this.project = new Project({
      // Optionally add tsConfigFilePath: find tsconfig.json?
      // skipAddingFilesFromTsConfig: true, // Control how files are added
    });
  }

  /** Adds a file to the project for analysis. */
  addSourceFile(filePath: string): SourceFile | undefined {
    try {
      return this.project.addSourceFileAtPath(filePath);
    } catch (error) {
      console.warn(
        `[IndexerService] Failed to add source file ${filePath}:`,
        error
      );
      return undefined;
    }
  }

  /** Refreshes a file's content from disk. */
  refreshSourceFile(filePath: string): SourceFile | undefined {
    const sourceFile = this.project.getSourceFile(filePath);
    if (sourceFile) {
      try {
        sourceFile.refreshFromFileSystemSync();
        return sourceFile;
      } catch (error) {
        console.warn(
          `[IndexerService] Failed to refresh source file ${filePath}:`,
          error
        );
        this.project.removeSourceFile(sourceFile);
        return undefined;
      }
    } else {
      return this.addSourceFile(filePath);
    }
  }

  /** Returns the currently indexed data. */
  getIndexedData(): ReadonlyMap<string, FileNode> {
    return this.indexedData;
  }

  /** Clears the indexed data and caches. */
  clearIndex(): void {
    this.indexedData.clear();
    this.importResolverCache.clear();
    // Optionally clear the ts-morph project too if needed
    // this.project = new Project({...}); // Recreate or clear files
    this._onIndexUpdateEmitter.fire(); // Notify about the clear
  }

  /**
   * Parses a single source file to extract component, hook, and dependency information.
   */
  parseFile(filePath: string): FileNode | null {
    const sourceFile = this.refreshSourceFile(filePath);
    if (!sourceFile) {
      return null;
    }

    // Clear cached imports for this file before parsing
    this.importResolverCache.delete(filePath);

    const components: ComponentNode[] = [];
    const hooks: HookNode[] = [];
    const fileId = filePath;
    const resolvedImports = this.resolveImports(sourceFile); // Use the helper

    try {
      // Find top-level function declarations
      sourceFile.getFunctions().forEach((func) => {
        this.processFunctionOrVariable(
          func,
          filePath,
          components,
          hooks,
          resolvedImports
        );
      });

      // Find top-level class declarations (potential class components)
      sourceFile.getClasses().forEach((cls) => {
        this.processClassDeclaration(
          cls,
          filePath,
          components,
          resolvedImports
        );
      });

      // Find components/hooks declared via variables (e.g., const MyComponent = () => ...)
      sourceFile.getVariableStatements().forEach((stmt) => {
        stmt.getDeclarations().forEach((decl) => {
          const initializer = decl.getInitializer();
          if (initializer) {
            // Pass the declaration node itself
            this.processFunctionOrVariable(
              decl,
              filePath,
              components,
              hooks,
              resolvedImports
            );
          }
        });
      });

      const fileNode: FileNode = {
        id: fileId,
        name: path.basename(filePath),
        kind: "File",
        filePath: filePath,
        imports: Array.from(resolvedImports.values()), // Get imports from the resolved map
        components: components,
        hooks: hooks,
        location: getNodeLocation(sourceFile.getFirstChild() ?? sourceFile),
      };

      // Store the result in the map
      this.indexedData.set(filePath, fileNode);
      this._onIndexUpdateEmitter.fire(); // Notify listeners
      return fileNode;
    } catch (error) {
      console.error(`[IndexerService] Error parsing file ${filePath}:`, error);
      return null;
    }
  }

  // Helper to resolve imports for a given file, caching results
  private resolveImports(sourceFile: SourceFile): Map<string, ImportData> {
    const filePath = sourceFile.getFilePath();
    if (this.importResolverCache.has(filePath)) {
      return this.importResolverCache.get(filePath)!;
    }

    const resolvedImports = new Map<string, ImportData>();
    const imports: ImportData[] = [];

    sourceFile.getImportDeclarations().forEach((importDecl) => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const location = getNodeLocation(importDecl);
      const namedImports = importDecl.getNamedImports();
      const namespaceImport = importDecl.getNamespaceImport()?.getText();
      const defaultImport = importDecl.getDefaultImport(); // Get the Identifier node

      const importData: ImportData = {
        moduleSpecifier,
        namedBindings: namedImports.map((spec) => spec.getName()),
        namespaceImport,
        defaultImport: defaultImport?.getText(),
        location,
        // resolvedPath: undefined, // We might resolve this later if needed
      };
      imports.push(importData);

      // Map named imports
      namedImports.forEach((spec) => {
        resolvedImports.set(spec.getName(), importData);
      });
      // Map default import
      if (defaultImport) {
        resolvedImports.set(defaultImport.getText(), importData);
      }
      // TODO: Handle namespace imports if needed (less common for components/hooks)
    });

    this.importResolverCache.set(filePath, resolvedImports);
    return resolvedImports;
  }

  // Helper to process potential component/hook declarations (Function, VariableDeclaration)
  private processFunctionOrVariable(
    node: FunctionDeclaration | VariableDeclaration, // Updated type
    filePath: string,
    components: ComponentNode[],
    hooks: HookNode[],
    resolvedImports: Map<string, ImportData> // Added
  ) {
    let nameNode: Identifier | undefined;
    let bodyNode: Node | undefined; // Node containing the function body or initializer
    let isExported = false;

    if (Node.isFunctionDeclaration(node)) {
      nameNode = node.getNameNode();
      bodyNode = node.getBody();
      isExported = node.isExported();
    } else if (Node.isVariableDeclaration(node)) {
      const nameId = node.getNameNode();
      if (Node.isIdentifier(nameId)) {
        nameNode = nameId;
        bodyNode = node.getInitializer(); // e.g., the arrow function or function expression
        // Check if the variable statement is exported
        const varStmt = node.getVariableStatement();
        isExported = varStmt?.isExported() ?? false;
      }
    }

    if (!nameNode || !bodyNode) {
      return; // Cannot process if name or body/initializer is missing
    }

    const name = nameNode.getText();
    const location = getNodeLocation(nameNode); // Location of the name identifier
    const bodyLocation = getNodeLocation(bodyNode); // Location of the function body/initializer

    // Extract details from the body/initializer
    const {
      hooksUsed,
      renderedComponents, // Keep renderedComponents extraction if it exists
      fileDependencies,
      libraryDependencies,
    } = this.analyzeBody(bodyNode, resolvedImports);

    if (isComponentName(name)) {
      components.push({
        id: `${filePath}:${name}`,
        name,
        kind: "Component",
        filePath,
        location,
        // Assume function components for now, need to detect class components separately
        isClassComponent: false,
        exported: isExported,
        hooksUsed,
        renderedComponents: renderedComponents || [], // Ensure it's an array
        fileDependencies,
        libraryDependencies,
      });
    } else if (isHookName(name)) {
      hooks.push({
        id: `${filePath}:${name}`,
        name,
        kind: "Hook",
        filePath,
        location,
        exported: isExported,
        hooksUsed,
        fileDependencies,
        libraryDependencies,
      });
    }
  }

  // Helper for class components
  private processClassDeclaration(
    cls: ClassDeclaration,
    filePath: string,
    components: ComponentNode[],
    resolvedImports: Map<string, ImportData> // Added
  ) {
    const nameNode = cls.getNameNode();
    if (!nameNode) return; // Skip anonymous classes

    const name = nameNode.getText();
    if (!isComponentName(name)) return; // Skip if not a component name

    const location = getNodeLocation(nameNode);
    const isExported = cls.isExported();

    // TODO: Analyze class body for hooks (less common), rendered components, dependencies
    // This requires parsing render() method, lifecycle methods etc.
    // For now, initialize with empty arrays, similar to functional components.
    const {
      hooksUsed,
      renderedComponents,
      fileDependencies,
      libraryDependencies,
    } = this.analyzeBody(cls, resolvedImports); // Analyze the whole class for now

    components.push({
      id: `${filePath}:${name}`,
      name,
      kind: "Component",
      filePath,
      location,
      isClassComponent: true, // Mark as class component
      exported: isExported,
      hooksUsed,
      renderedComponents: renderedComponents || [],
      fileDependencies,
      libraryDependencies,
    });
  }

  // New helper function to analyze the body of a function, arrow function, or class
  private analyzeBody(
    bodyNode: Node,
    resolvedImports: Map<string, ImportData>
  ): {
    hooksUsed: HookUsage[];
    renderedComponents: { name: string; location: SymbolLocation }[]; // Keep this if needed
    fileDependencies: DependencyInfo[];
    libraryDependencies: DependencyInfo[];
  } {
    const hooksUsed: HookUsage[] = [];
    const renderedComponents: { name: string; location: SymbolLocation }[] = [];
    const fileDependencies = new Map<string, DependencyInfo>(); // Use Map to avoid duplicates
    const libraryDependencies = new Map<string, DependencyInfo>(); // Use Map to avoid duplicates

    // Find hook calls
    bodyNode.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
      const expression = call.getExpression();
      if (Node.isIdentifier(expression)) {
        const hookName = expression.getText();
        if (isHookName(hookName)) {
          hooksUsed.push({
            hookName,
            location: getNodeLocation(call),
          });
          // Also check if the hook itself is imported
          const importData = resolvedImports.get(hookName);
          if (importData) {
            const depInfo: DependencyInfo = {
              name: hookName,
              source: importData.moduleSpecifier,
              location: getNodeLocation(expression), // Location of the identifier usage
            };
            if (isExternalLibrary(importData.moduleSpecifier)) {
              if (!libraryDependencies.has(importData.moduleSpecifier)) {
                libraryDependencies.set(importData.moduleSpecifier, depInfo);
              }
            } else {
              if (!fileDependencies.has(importData.moduleSpecifier)) {
                fileDependencies.set(importData.moduleSpecifier, depInfo);
              }
            }
          }
        }
      }
      // TODO: Handle MemberAccessExpression (e.g., React.useState) if needed
    });

    // Find rendered components (JSX elements) - Keeping existing logic if present
    bodyNode
      .getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
      .forEach((jsx) => {
        const tagName = jsx.getTagNameNode().getText();
        const filePath = bodyNode.getSourceFile().getFilePath(); // Get file path for logging context
        console.log(
          `[Indexer Log - ${path.basename(
            filePath
          )}] Visiting JsxOpeningElement: <${tagName}>`
        ); // Log visit
        // Basic check: If tag name starts with uppercase, assume it's a component
        if (isComponentName(tagName)) {
          renderedComponents.push({
            name: tagName,
            location: getNodeLocation(jsx.getTagNameNode()),
          });
          console.log(
            `[Indexer Log - ${path.basename(
              filePath
            )}]   Identified as component: ${tagName}`
          ); // Log identification
          // Also check if the component is imported
          const importData = resolvedImports.get(tagName);
          if (importData) {
            console.log(
              `[Indexer Log - ${path.basename(
                filePath
              )}]   Resolved import for ${tagName}:`,
              importData.moduleSpecifier
            ); // Log import resolution
            const depInfo: DependencyInfo = {
              name: tagName,
              source: importData.moduleSpecifier,
              location: getNodeLocation(jsx.getTagNameNode()), // Location of the tag usage
            };
            if (isExternalLibrary(importData.moduleSpecifier)) {
              console.log(
                `[Indexer Log - ${path.basename(
                  filePath
                )}]     Adding to libraryDependencies: ${tagName} from ${
                  importData.moduleSpecifier
                }`
              ); // Log adding dependency
              if (!libraryDependencies.has(importData.moduleSpecifier)) {
                libraryDependencies.set(importData.moduleSpecifier, depInfo);
              }
            } else {
              console.log(
                `[Indexer Log - ${path.basename(
                  filePath
                )}]     Adding to fileDependencies: ${tagName} from ${
                  importData.moduleSpecifier
                }`
              ); // Log adding dependency
              if (!fileDependencies.has(importData.moduleSpecifier)) {
                fileDependencies.set(importData.moduleSpecifier, depInfo);
              }
            }
          } else {
            console.log(
              `[Indexer Log - ${path.basename(
                filePath
              )}]   Could not resolve import for component: ${tagName}`
            ); // Log failed resolution
          }
        }
      });
    bodyNode
      .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
      .forEach((jsx) => {
        const tagName = jsx.getTagNameNode().getText();
        const filePath = bodyNode.getSourceFile().getFilePath(); // Get file path for logging context
        console.log(
          `[Indexer Log - ${path.basename(
            filePath
          )}] Visiting JsxSelfClosingElement: <${tagName} />`
        ); // Log visit
        if (isComponentName(tagName)) {
          renderedComponents.push({
            name: tagName,
            location: getNodeLocation(jsx.getTagNameNode()),
          });
          console.log(
            `[Indexer Log - ${path.basename(
              filePath
            )}]   Identified as component: ${tagName}`
          ); // Log identification
          // Also check if the component is imported
          const importData = resolvedImports.get(tagName);
          if (importData) {
            console.log(
              `[Indexer Log - ${path.basename(
                filePath
              )}]   Resolved import for ${tagName}:`,
              importData.moduleSpecifier
            ); // Log import resolution
            const depInfo: DependencyInfo = {
              name: tagName,
              source: importData.moduleSpecifier,
              location: getNodeLocation(jsx.getTagNameNode()),
            };
            if (isExternalLibrary(importData.moduleSpecifier)) {
              console.log(
                `[Indexer Log - ${path.basename(
                  filePath
                )}]     Adding to libraryDependencies: ${tagName} from ${
                  importData.moduleSpecifier
                }`
              ); // Log adding dependency
              if (!libraryDependencies.has(importData.moduleSpecifier)) {
                libraryDependencies.set(importData.moduleSpecifier, depInfo);
              }
            } else {
              console.log(
                `[Indexer Log - ${path.basename(
                  filePath
                )}]     Adding to fileDependencies: ${tagName} from ${
                  importData.moduleSpecifier
                }`
              ); // Log adding dependency
              if (!fileDependencies.has(importData.moduleSpecifier)) {
                fileDependencies.set(importData.moduleSpecifier, depInfo);
              }
            }
          } else {
            console.log(
              `[Indexer Log - ${path.basename(
                filePath
              )}]   Could not resolve import for component: ${tagName}`
            ); // Log failed resolution
          }
        }
      });

    // Find other identifier usages that might be imports (simple approach)
    // This is complex because an identifier could be a local variable, prop, etc.
    // A more robust approach involves using the TypeScript Language Service or deeper type analysis.
    // For now, we focus on hooks and components identified above.
    // We could iterate through *all* identifiers and check resolvedImports, but it might be noisy.

    return {
      hooksUsed,
      renderedComponents,
      fileDependencies: Array.from(fileDependencies.values()),
      libraryDependencies: Array.from(libraryDependencies.values()),
    };
  }

  /** Fetches the indexed data for a specific file. */
  getFileData(filePath: string): FileNode | undefined {
    return this.indexedData.get(filePath);
  }

  /** Finds the location of a component or hook definition. */
  findSymbolLocation(
    filePath: string,
    symbolName: string
  ): SymbolLocation | undefined {
    const fileData = this.indexedData.get(filePath);
    if (!fileData) return undefined;

    const component = fileData.components.find((c) => c.name === symbolName);
    if (component) return component.location;

    const hook = fileData.hooks.find((h) => h.name === symbolName);
    if (hook) return hook.location;

    // TODO: Search imports if not found locally? Requires resolving imports.

    return undefined;
  }

  dispose() {
    // Clean up resources if necessary, e.g., dispose event emitters
    this._onIndexUpdateEmitter.dispose();
  }
}
