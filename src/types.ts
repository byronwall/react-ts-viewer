import * as ts from "typescript";
import * as vscode from "vscode";

/** Represents the location of a symbol within a file. */
export interface SymbolLocation {
  uri: vscode.Uri;
  range: vscode.Range;
}

/** Base interface for all nodes in our analysis graph. */
export interface BaseNode {
  id: string; // Unique identifier (e.g., filePath + ':' + name)
  name: string;
  kind: string; // e.g., 'Component', 'Hook', 'File', 'Variable'
  location: SymbolLocation;
}

// Added: Represents an external dependency (file or library)
export interface DependencyInfo {
  name: string; // Name of the imported symbol or module path
  source: string; // Module specifier (e.g., './utils', 'react')
  location: SymbolLocation; // Location of the import usage (approximated for now)
}

export interface FileNode extends BaseNode {
  kind: "File";
  filePath: string;
  imports: ImportData[];
  components: ComponentNode[];
  hooks: HookNode[];
}

export interface ComponentNode extends BaseNode {
  kind: "Component";
  filePath: string;
  renderedComponents: { name: string; location: SymbolLocation }[]; // Added: Components rendered by this one
  hooksUsed: HookUsage[]; // Added: Hooks used by this component
  fileDependencies: DependencyInfo[]; // Added
  libraryDependencies: DependencyInfo[]; // Added
  // propsType?: PropDefinition[]; // Added later by analysis service
  // renderEdges?: RenderEdge[]; // Added later by analysis service
  isClassComponent: boolean;
  exported: boolean; // Is it directly exported from the file?
}

export interface HookNode extends BaseNode {
  kind: "Hook";
  filePath: string;
  hooksUsed: HookUsage[]; // Added: Hooks used by this hook
  fileDependencies: DependencyInfo[]; // Added
  libraryDependencies: DependencyInfo[]; // Added
  exported: boolean;
}

export interface VariableNode extends BaseNode {
  kind: "Variable";
  filePath: string;
  // Add more details as needed
}

/** Represents the usage of a hook within a component or another hook. */
export interface HookUsage {
  hookName: string; // Name of the hook being used (e.g., "useState", "useCustomHook")
  location: SymbolLocation; // Location of the call expression
  // callIndex?: number; // Order of execution (complex to determine accurately, add later)
  // arguments?: any[]; // Parsed arguments (complex, add later)
}

/** Represents an import statement. */
export interface ImportData {
  moduleSpecifier: string; // e.g., 'react', './utils', '../components/Button'
  namedBindings?: string[]; // e.g., ['useState', 'useEffect']
  namespaceImport?: string; // e.g., '* as React'
  defaultImport?: string; // e.g., 'MyComponent'
  location: SymbolLocation;
  resolvedPath?: string; // Absolute path if resolved, undefined for external modules
}

/** Represents a "renders" relationship between components. */
export interface RenderEdge {
  sourceId: string; // ID of the rendering component
  targetId: string; // ID of the rendered component
  location: SymbolLocation; // Location of the JSX element/call site
  callSites: number; // How many times does A render B?
}

/** Represents an import/export relationship between files or modules. */
export interface ImportEdge {
  sourceId: string; // ID of the importing file/module
  targetId: string; // ID of the imported file/module (or external module name)
  importData: ImportData; // Details of the import statement
}

/** Represents the definition of a component prop. */
export interface PropDefinition {
  name: string;
  typeString: string; // Type representation (e.g., 'string', '() => void', 'MyInterface')
  isRequired: boolean;
  location?: SymbolLocation; // Where the prop is defined (e.g., in interface or type alias)
}

export interface Position {
  line: number; // 1-based
  column: number; // 0-based
}

export enum NodeCategory {
  Program = "Program",
  Module = "Module",
  Class = "Class",
  Function = "Function",
  ArrowFunction = "ArrowFunction",
  Block = "Block",
  ControlFlow = "ControlFlow",
  Variable = "Variable",
  Call = "Call",
  ReactComponent = "ReactComponent",
  ReactHook = "ReactHook",
  JSX = "JSX",
  JSXElementDOM = "JSXElementDOM",
  JSXElementCustom = "JSXElementCustom",
  Import = "Import",
  TypeAlias = "TypeAlias",
  Interface = "Interface",
  Literal = "Literal",
  SyntheticGroup = "SyntheticGroup",

  // Add these new categories:
  ConditionalBlock = "ConditionalBlock",
  IfClause = "IfClause",
  ElseIfClause = "ElseIfClause",
  ElseClause = "ElseClause",

  Other = "Other", // Ensure 'Other' is still present
}

export interface ScopeNode {
  id: string; // `${file}:${start}-${end}`
  kind: number; // raw TypeScript ts.SyntaxKind
  category: NodeCategory; // high-level bucket
  label: string; // human-readable (e.g. function name)
  loc: { start: Position; end: Position };
  source: string; // exact slice of original text
  value: number; // #chars or LOC — used by treemap layout
  meta?: Record<string, any>; // hooks, props, anything extra
  children: ScopeNode[];
}

// Options for buildScopeTree function
export interface BuildScopeTreeOptions {
  flattenTree?: boolean;
  flattenBlocks?: boolean;
  flattenArrowFunctions?: boolean;
  createSyntheticGroups?: boolean;
  includeImports?: boolean;
  includeTypes?: boolean;
  includeLiterals?: boolean;
}

// Add more types as needed for tracing, etc.
