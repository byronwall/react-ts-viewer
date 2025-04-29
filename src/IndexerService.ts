import * as vscode from "vscode";
import {
  Project,
  SourceFile,
  SyntaxKind,
  FunctionDeclaration,
  ClassDeclaration,
  VariableStatement,
  Node,
  Identifier,
  JsxOpeningElement,
  JsxSelfClosingElement,
  CallExpression,
} from "ts-morph";
import {
  ComponentNode,
  HookNode,
  FileNode,
  ImportData,
  SymbolLocation,
  HookUsage,
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

export class IndexerService {
  private project: Project;
  private indexedData: Map<string, FileNode> = new Map(); // Store indexed data

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

  /** Clears the indexed data. */
  clearIndex(): void {
    this.indexedData.clear();
    // Optionally clear the ts-morph project too if needed
    // this.project = new Project({...}); // Recreate or clear files
  }

  /**
   * Parses a single source file to extract basic component and hook information.
   * This is a simplified POC version.
   */
  parseFile(
    filePath: string
  ):
    | (Partial<FileNode> & { components: ComponentNode[]; hooks: HookNode[] })
    | null {
    const sourceFile = this.refreshSourceFile(filePath);
    if (!sourceFile) {
      return null;
    }

    const components: ComponentNode[] = [];
    const hooks: HookNode[] = [];
    const imports: ImportData[] = [];
    const fileId = filePath; // Use filePath as unique ID for now
    const renderedComponents: { name: string; location: SymbolLocation }[] = [];

    try {
      // Basic import parsing
      sourceFile.getImportDeclarations().forEach((importDecl) => {
        const moduleSpecifier = importDecl.getModuleSpecifierValue();
        const location = getNodeLocation(importDecl);
        const namedBindings = importDecl
          .getNamedImports()
          .map((spec) => spec.getName());
        const namespaceImport = importDecl.getNamespaceImport()?.getText();
        const defaultImport = importDecl.getDefaultImport()?.getText();
        imports.push({
          moduleSpecifier,
          namedBindings,
          namespaceImport,
          defaultImport,
          location,
        });
      });

      // Find top-level function declarations
      sourceFile.getFunctions().forEach((func) => {
        this.processFunctionOrVariable(func, filePath, components, hooks);
      });

      // Find top-level class declarations (potential class components)
      sourceFile.getClasses().forEach((cls) => {
        this.processClassDeclaration(cls, filePath, components);
      });

      // Find components/hooks declared via variables (e.g., const MyComponent = () => ...)
      sourceFile.getVariableStatements().forEach((stmt) => {
        stmt.getDeclarations().forEach((decl) => {
          const initializer = decl.getInitializer();
          if (initializer) {
            this.processFunctionOrVariable(decl, filePath, components, hooks);
          }
        });
      });

      const fileNode: FileNode = {
        id: fileId,
        name: path.basename(filePath),
        kind: "File",
        filePath: filePath,
        imports: imports,
        components: components,
        hooks: hooks,
        location: getNodeLocation(sourceFile.getFirstChild() ?? sourceFile), // Approx location
      };

      // Store the result in the map
      this.indexedData.set(filePath, fileNode);

      // Notify listeners that a file has been processed
      this._onIndexUpdateEmitter.fire();

      return fileNode; // Return the full FileNode
    } catch (error) {
      console.error(`[IndexerService] Error parsing file ${filePath}:`, error);
      // Optionally remove from index if parsing fails?
      // this.indexedData.delete(filePath);
      return null;
    }
  }

  // Helper to process potential component/hook declarations (Function, Variable)
  private processFunctionOrVariable(
    node: FunctionDeclaration | ClassDeclaration | Node, // More specific type needed for Variables
    filePath: string,
    components: ComponentNode[],
    hooks: HookNode[]
  ) {
    let nameNode: Identifier | undefined;
    let isExported = false;
    let functionNode: Node | undefined = node; // The node representing the function body/class
    const renderedComponents: { name: string; location: SymbolLocation }[] = [];

    if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node)) {
      nameNode = node.getNameNode();
      isExported = node.isExported();
    } else if (Node.isVariableDeclaration(node)) {
      const nameId = node.getNameNode();
      if (Node.isIdentifier(nameId)) {
        nameNode = nameId;
      }
      const initializer = node.getInitializer();
      if (
        Node.isArrowFunction(initializer) ||
        Node.isFunctionExpression(initializer)
      ) {
        functionNode = initializer;
      }
      isExported =
        node
          .getFirstAncestorByKind(SyntaxKind.VariableStatement)
          ?.isExported() ?? false;
    }

    if (!nameNode) return;
    const name = nameNode.getText();
    const location = getNodeLocation(nameNode); // Location of the name identifier
    const id = `${filePath}:${name}`;

    if (isComponentName(name)) {
      // Basic check: Does it return JSX?
      let hasJsx = false;
      const hooksUsed: HookUsage[] = []; // Initialize hooksUsed for this component

      if (functionNode) {
        functionNode.forEachDescendant((descNode) => {
          // Find rendered components (JSX elements)
          if (
            descNode.getKind() === SyntaxKind.JsxElement ||
            descNode.getKind() === SyntaxKind.JsxSelfClosingElement
          ) {
            hasJsx = true; // Mark if any JSX is found
            let tagNameNode: Identifier | undefined;
            if (Node.isJsxElement(descNode)) {
              tagNameNode = descNode
                .getOpeningElement()
                .getTagNameNode() as Identifier;
            } else if (Node.isJsxSelfClosingElement(descNode)) {
              tagNameNode = descNode.getTagNameNode() as Identifier;
            }

            if (tagNameNode && Node.isIdentifier(tagNameNode)) {
              const renderedComponentName = tagNameNode.getText();
              if (isComponentName(renderedComponentName)) {
                renderedComponents.push({
                  name: renderedComponentName,
                  location: getNodeLocation(tagNameNode),
                });
              }
            }
            // Do not return true here, continue searching the rest of the function body
          }

          // Find hook usages (CallExpressions like useState(), api.useThing())
          if (Node.isCallExpression(descNode)) {
            const expression = descNode.getExpression();
            let hookName: string | undefined;
            let nameIdentifier: Node | undefined;

            console.log(
              `[Indexer] Checking CallExpression: ${expression.getText()}`
            ); // DEBUG

            if (Node.isIdentifier(expression)) {
              const potentialHookName = expression.getText();
              if (isHookName(potentialHookName)) {
                hookName = potentialHookName;
                nameIdentifier = expression;
                console.log(`  Found Identifier hook: ${hookName}`); // DEBUG
              }
            } else if (Node.isPropertyAccessExpression(expression)) {
              const potentialHookName = expression.getName(); // Get the last part (e.g., useQuery)
              if (isHookName(potentialHookName)) {
                hookName = expression.getText(); // Store the full expression text (e.g., api.task.useQuery)
                nameIdentifier = expression.getNameNode(); // Location of the final identifier
                console.log(`  Found PropAccess hook: ${hookName}`); // DEBUG
              }
            }

            if (hookName && nameIdentifier) {
              hooksUsed.push({
                hookName: hookName,
                location: getNodeLocation(nameIdentifier), // Location of the specific hook name identifier
              });
            }
          }

          return undefined; // Continue traversal
        });
      }

      if (hasJsx || Node.isClassDeclaration(node)) {
        // Assume class is a component for now
        components.push({
          id: id,
          name: name,
          kind: "Component",
          location: location,
          filePath: filePath,
          isClassComponent: Node.isClassDeclaration(node),
          exported: isExported,
          renderedComponents: renderedComponents,
          hooksUsed: hooksUsed, // Assign the collected HookUsage objects
        });
      }
    } else if (isHookName(name)) {
      hooks.push({
        id: id,
        name: name,
        kind: "Hook",
        location: location,
        filePath: filePath,
        exported: isExported,
      });
    }
  }

  // Helper specifically for Class Declarations (may be redundant with above but clearer)
  private processClassDeclaration(
    cls: ClassDeclaration,
    filePath: string,
    components: ComponentNode[]
  ) {
    const nameNode = cls.getNameNode();
    if (!nameNode) return;
    const name = nameNode.getText();
    const location = getNodeLocation(nameNode);
    const id = `${filePath}:${name}`;

    // Crude check: Does it extend React.Component or React.PureComponent?
    const heritageClauses = cls.getHeritageClauses();
    let isReactClass = false;
    heritageClauses.forEach((clause) => {
      clause.getTypeNodes().forEach((typeNode) => {
        const text = typeNode.getText();
        if (
          text === "React.Component" ||
          text === "Component" ||
          text === "React.PureComponent" ||
          text === "PureComponent"
        ) {
          isReactClass = true;
        }
      });
    });

    // Only add if it looks like a React class component
    if (isReactClass || isComponentName(name)) {
      // Fallback to name check
      const renderedComponents: { name: string; location: SymbolLocation }[] =
        [];

      // Find the render method
      const renderMethod = cls.getMethod("render");
      if (renderMethod) {
        renderMethod.forEachDescendant((descNode) => {
          if (
            descNode.getKind() === SyntaxKind.JsxElement ||
            descNode.getKind() === SyntaxKind.JsxSelfClosingElement
          ) {
            let tagNameNode: Identifier | undefined;
            if (Node.isJsxElement(descNode)) {
              tagNameNode = descNode
                .getOpeningElement()
                .getTagNameNode() as Identifier;
            } else if (Node.isJsxSelfClosingElement(descNode)) {
              tagNameNode = descNode.getTagNameNode() as Identifier;
            }

            if (tagNameNode && Node.isIdentifier(tagNameNode)) {
              const renderedComponentName = tagNameNode.getText();
              if (isComponentName(renderedComponentName)) {
                renderedComponents.push({
                  name: renderedComponentName,
                  location: getNodeLocation(tagNameNode),
                });
              }
            }
            // Don't stop traversal here, find all JSX in render method
          }
          return undefined; // Continue traversal
        });
      }

      components.push({
        id: id,
        name: name,
        kind: "Component",
        location: location,
        filePath: filePath,
        isClassComponent: true,
        exported: cls.isExported(),
        renderedComponents: renderedComponents,
        hooksUsed: [], // Class components don't use hooks directly
      });
    }
  }

  // Add methods for resolving imports, finding relationships later

  dispose() {
    this._onIndexUpdateEmitter.dispose();
  }
}
