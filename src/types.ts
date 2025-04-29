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
  // propsType?: PropDefinition[]; // Added later by analysis service
  // hooksUsed?: HookUsage[]; // Added later by indexer
  // renderEdges?: RenderEdge[]; // Added later by analysis service
  isClassComponent: boolean;
  exported: boolean; // Is it directly exported from the file?
}

export interface HookNode extends BaseNode {
  kind: "Hook";
  filePath: string;
  // hooksUsed?: HookUsage[]; // Added later by indexer
  exported: boolean;
}

export interface VariableNode extends BaseNode {
  kind: "Variable";
  filePath: string;
  // Add more details as needed
}

/** Represents the usage of a hook within a component or another hook. */
export interface HookUsage {
  hookId: string; // ID of the HookNode being used
  location: SymbolLocation;
  callIndex: number; // Order of execution within the component/hook
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

// Add more types as needed for tracing, etc.
