# Layout References w/ ELK

Goals:

- Use ELK to layout the treemap
- The goal is to take a block of code and break it down to show external references
- For a given block of code, decompose into:
  - Every external reference - determine where it comes from: import, earlier code scope, etc.
  - Draw an edge from the source to the reference
- Use ELK to layout the code and the references
- Other code blocks should be rendered to the side with lower opacity

## Interactive Reference Graph Mode

**Feature Summary:**
Introduces an "Interactive Reference Graph Mode" within the main treemap view. Triggered by a `Shift+Click` on a code node, this mode dynamically re-layouts the view from a hierarchical treemap into a directed dependency graph using ELK. It visualizes the selected node, its direct references, and their sources. The graph can be interactively expanded to explore nested dependencies.

**User Story:**
As a developer analyzing my codebase in the treemap, I want to `Shift+Click` a function or component to instantly transform the view into a dependency graph. This allows me to see all its immediate dependencies clearly. I can then `Shift+Click` on any of its dependencies to expand the graph further, enabling me to fluidly explore chains of references without leaving the view.

**Key Workflow & Implementation Details:**

1. **Activation & State Management:**

   - **Trigger:** The user `Shift+Clicks` a `ScopeNode` in the treemap. The extension enters a "Reference Graph Mode."
   - **State:** A state flag (e.g., `viewMode: 'treemap' | 'referenceGraph'`) will manage the current layout.
   - **Exiting Mode:** Pressing the `Escape` key or `Shift+Clicking` the initial focus node again will exit the mode, reverting the view to the standard hierarchical treemap layout.

2. **Reference Resolution (Primary Technical Investigation):**
   To find where a reference is defined, we must resolve the symbol. There are two primary approaches:

   - **Option A (Recommended to Investigate First): Use VS Code's Language Service.**
     - **Mechanism:** Leverage the built-in `vscode.executeDefinitionProvider` command. For a given identifier at a specific location, this API asks VS Code's own language server for the definition location.
     - **Pros:** Highly efficient, reuses VS Code's existing project-wide index, and avoids running a second, resource-intensive type-checker.
     - **Cons:** An asynchronous API that must be carefully managed within the rendering loop. May require a loading state while definitions are being resolved.
   - **Option B: Integrate the TS Type Checker.**
     - **Mechanism:** Use the `Program` and `TypeChecker` from the TypeScript Compiler API directly within the extension.
     - **Pros:** Full, synchronous control over symbol resolution.
     - **Cons:** Higher memory/CPU usage. Potentially slower initial analysis as it builds its own program representation.

3. **Graph Construction & On-Demand Parsing:**

   - When a node is `Shift+Clicked`, the reference resolution process is initiated.
   - For each resolved dependency, the system will look up its corresponding `ScopeNode` by its source file and location.
   - **Critical Handling:** If the dependency is in a file that has not yet been parsed, the extension will **parse that file on-demand**, generate its `ScopeNode` tree, and add it to the global collection of nodes. The new `ScopeNode` will be given a default `value` for rendering.
   - A separate data structure, `ELKGraph = { nodes: ElkNode[], edges: ElkEdge[] }`, will be created for the layout engine.

4. **Layout & Rendering:**

   - **ELK Input:** The `ELKGraph` is passed to the ELK engine. "Relevant" nodes (the focus, its references, and same-file context nodes) are included.
   - **ELK Output:** ELK returns a layout with `x`, `y`, `width`, and `height` for each node, and path data for each edge.
   - **Rendering Logic:** The existing SVG renderer will:
     - Use the ELK layout data to position the relevant nodes.
     - Render all other `ScopeNode`s that are _not_ in the ELK layout as hidden (`display: none`).
     - Draw the SVG edges on top of the nodes using the path data from ELK.
     - Apply the existing color scheme and styling to all visible nodes.

5. **Interactive Expansion:**
   - When the user `Shift+Clicks` a **reference node** already in the graph, the reference resolution process runs _on that new node_.
   - The resulting new nodes and edges are **added** to the existing `ELKGraph` data structure.
   - The entire, expanded graph is then passed back to ELK for a fresh layout. This allows the graph to grow organically based on user exploration.
   - The system should handle cycles gracefully (i.e., not adding duplicate nodes or edges if a reference points back to an already-visible node).

**Supported Interactions in Graph Mode:**

- **`Shift+Click`**: On a node not yet expanded, finds its references and adds them to the graph. On the original focus node, collapses the graph and returns to treemap mode.
- **`Cmd+Click`**: Jumps to the source code of the clicked node.
- **`Alt+Click`**: (Lower priority) Drills down into a node's children, replacing the graph view with a treemap of just that node.

**Out of Scope for This Version:**

- Automatic layout of nodes that are not part of the active reference graph (they will be hidden).
- Advanced edge routing styles beyond ELK's default.
- Performance optimizations for graphs with thousands of interactively expanded nodes.

## Implementation Plan

### Overview

The implementation will integrate ELK.js for reference graph layout while maintaining the existing hierarchical treemap functionality. The system will operate in two distinct modes: standard treemap view and interactive reference graph mode, with smooth transitions between them.

**Architecture Strategy:**

- Extend the existing treemap architecture rather than replacing it
- Add ELK as an alternative layout engine alongside the current Guillotine-based hierarchical layout
- Leverage existing ScopeNode parsing and rendering infrastructure
- Implement reference resolution using VS Code's language service API for optimal performance

### New Data Structures

#### Reference Graph Data Structures

```typescript
// Core ELK integration types
interface ELKLayoutNode {
  id: string;
  width: number;
  height: number;
  x?: number; // Set by ELK after layout
  y?: number; // Set by ELK after layout
  children?: ELKLayoutNode[];
  layoutOptions?: { [key: string]: any };
}

interface ELKLayoutEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: ELKEdgeSection[]; // Path data from ELK
}

interface ELKEdgeSection {
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  bendPoints?: Array<{ x: number; y: number }>;
}

interface ELKGraph {
  id: string;
  children: ELKLayoutNode[];
  edges: ELKLayoutEdge[];
  layoutOptions: { [key: string]: any };
}
```

#### Reference Resolution Types

```typescript
// Reference resolution and management
interface SymbolReference {
  identifier: string;
  position: Position; // Location in source code
  sourceNodeId: string; // ScopeNode that contains this reference
  definitionLocation?: vscode.Location; // Where the symbol is defined
  isResolved: boolean;
  isExternal: boolean; // Is it from node_modules or built-in
}

interface ReferenceGraphState {
  focusNodeId: string; // The original Shift+clicked node
  expandedNodeIds: Set<string>; // Nodes that have been expanded
  activeNodes: Set<string>; // Currently visible nodes in graph
  activeEdges: Map<string, SymbolReference>; // Edge ID -> reference data
  elkGraph: ELKGraph | null; // Current ELK layout
  isLoading: boolean; // Reference resolution in progress
}

// Extension of existing ScopeNode for reference data
interface ScopeNodeWithReferences extends ScopeNode {
  references?: SymbolReference[];
  isReferenceParsed?: boolean;
}
```

#### Layout Mode Management

```typescript
// View state management
type ViewMode = "treemap" | "referenceGraph";

interface TreemapViewState {
  viewMode: ViewMode;
  referenceGraph?: ReferenceGraphState;
  hierarchicalLayout?: HierarchicalLayoutNode; // Current treemap layout
  transitionState?: "entering-graph" | "exiting-graph" | null;
}
```

### Integration Points with Existing Code

#### 1. TreemapSVG.tsx Extensions

**New Props:**

```typescript
interface TreemapSVGProps {
  // ... existing props
  viewMode: ViewMode;
  referenceGraphState?: ReferenceGraphState;
  onReferenceResolution?: (nodeId: string) => Promise<SymbolReference[]>;
  onViewModeChange?: (mode: ViewMode) => void;
}
```

**Event Handler Updates:**

- Extend `onNodeClick` to detect `Shift+Click` events
- Add keyboard event handling for Escape key
- Implement mode transition logic

**Rendering Path Modification:**

```typescript
const renderContent = useMemo(() => {
  if (viewMode === 'referenceGraph' && referenceGraphState?.elkGraph) {
    return <ReferenceGraphRenderer
      elkGraph={referenceGraphState.elkGraph}
      scopeNodes={allScopeNodes}
      settings={settings}
      onNodeClick={onNodeClick}
      // ... other props
    />;
  }

  return <TreemapContent /* existing treemap rendering */ />;
}, [viewMode, referenceGraphState, /* other deps */]);
```

#### 2. Layout Engine Integration

**New Layout Function:**

```typescript
// Parallel to layoutHierarchical.ts
export interface ELKLayoutFn {
  (
    focusNode: ScopeNode,
    referencedNodes: ScopeNode[],
    references: SymbolReference[],
    viewportWidth: number,
    viewportHeight: number,
    options: ELKLayoutOptions
  ): Promise<ELKGraph>;
}

export const layoutWithELK: ELKLayoutFn = async (
  focusNode,
  referencedNodes,
  references,
  viewportWidth,
  viewportHeight,
  options
) => {
  // Transform ScopeNodes to ELK format
  // Apply ELK layout algorithm
  // Return positioned graph
};
```

**Layout Options:**

```typescript
interface ELKLayoutOptions {
  algorithm: "layered" | "force" | "stress";
  direction: "DOWN" | "UP" | "LEFT" | "RIGHT";
  nodeSpacing: number;
  edgeSpacing: number;
  levelSpacing: number;
  // ELK-specific options
  "elk.spacing.nodeNode"?: string;
  "elk.layered.spacing.nodeNodeBetweenLayers"?: string;
  "elk.direction"?: string;
}
```

#### 3. Reference Resolution Service

**Extension Integration:**

```typescript
// New service in extension side
export class ReferenceResolver {
  constructor(private context: vscode.ExtensionContext) {}

  async resolveReferences(
    filePath: string,
    position: vscode.Position,
    identifier: string
  ): Promise<vscode.Location[]> {
    return vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      vscode.Uri.file(filePath),
      position
    ) as Promise<vscode.Location[]>;
  }

  async analyzeNodeReferences(
    node: ScopeNode,
    sourceText: string
  ): Promise<SymbolReference[]> {
    // Parse node content for identifier references
    // Resolve each reference using VS Code API
    // Return array of resolved references
  }
}
```

#### 4. Webview Communication Protocol

**New Message Types:**

```typescript
// Extension -> Webview
interface ReferenceResolutionResponse {
  command: "referenceResolutionComplete";
  nodeId: string;
  references: SymbolReference[];
  referencedNodes: ScopeNode[]; // Newly parsed nodes if needed
}

// Webview -> Extension
interface ResolveReferencesRequest {
  command: "resolveReferences";
  nodeId: string;
  filePath: string;
  position: Position;
}

interface ParseFileRequest {
  command: "parseFile";
  filePath: string;
  reason: "reference-resolution";
}
```

### Implementation Phases

#### Phase 1: Foundation (ELK Integration)

1. **Install ELK.js dependency** in webview package
2. **Create basic ELK layout function** parallel to `layoutHierarchical`
3. **Add view mode state management** to TreemapSVG
4. **Implement mode switching UI** with basic Shift+Click detection
5. **Create placeholder reference graph renderer** that shows static nodes

**Deliverable:** Ability to switch between treemap and a basic ELK-rendered view of the same nodes

#### Phase 2: Reference Resolution

1. **Implement ReferenceResolver service** in extension
2. **Add reference analysis to parser** (optional mode in buildScopeTree)
3. **Extend webview communication** for reference requests
4. **Build reference extraction logic** for different node types (functions, variables, imports)
5. **Handle VS Code API integration** with proper error handling and timeouts

**Deliverable:** Shift+Click on a node triggers reference resolution and displays connected nodes

#### Phase 3: Interactive Graph

1. **Implement graph expansion logic** for Shift+Click on reference nodes
2. **Add cycle detection and prevention** in graph building
3. **Create on-demand file parsing** for external references
4. **Implement graph state persistence** across interactions
5. **Add loading states and error handling** for async operations

**Deliverable:** Fully interactive reference graph with expansion capabilities

#### Phase 4: Polish & Performance

1. **Optimize ELK layout options** for different graph sizes
2. **Add smooth transitions** between treemap and graph modes
3. **Implement graph rendering optimizations** (virtualization for large graphs)
4. **Add configuration options** for graph behavior
5. **Performance testing and optimization** for large codebases

**Deliverable:** Production-ready reference graph feature

### Technical Considerations

#### ELK Integration Specifics

- **Algorithm Selection:** Start with 'layered' for hierarchical layouts, consider 'force' for more organic reference networks
- **Node Sizing:** Reuse existing ScopeNode sizing logic, ensure consistent dimensions between modes
- **Edge Routing:** Leverage ELK's built-in edge routing, consider custom edge rendering for different reference types

#### Performance Optimization

- **Lazy Loading:** Only resolve references when nodes are expanded
- **Caching:** Cache resolved references and parsed files in extension memory
- **Graph Size Limits:** Implement safeguards against exponential graph growth
- **Async Reference Resolution:** Use Promise batching for multiple reference lookups

#### Error Handling

- **Language Service Failures:** Graceful degradation when VS Code APIs are unavailable
- **Parse Failures:** Continue with partial results when referenced files can't be parsed
- **Circular References:** Detect and handle cycles in dependency chains
- **Memory Limits:** Implement graph size limits and cleanup strategies

#### Compatibility

- **File Type Support:** Initially focus on TypeScript/JavaScript, extend to other languages later
- **Settings Integration:** Respect existing treemap settings where applicable
- **Accessibility:** Ensure keyboard navigation works in graph mode
- **Theme Support:** Maintain visual consistency with existing treemap themes

This implementation plan provides a structured approach to adding ELK-based reference graph functionality while preserving the existing treemap architecture and ensuring robust performance characteristics.

## Comments on initial plan

Perfect! The logs clearly show what's happening and why you're not seeing the references you expected. Let me break down what the logs reveal:

## **What You Clicked On**

- **Node**: `handleNextWeek [98-100]` (a Variable category node)
- **Location**: Inside `WeeklyCalendar.tsx`
- **Expected**: All references from inside that container to things outside of it

## **What the System Currently Does (The Problem)**

The logs clearly show the current limitation:

```
🔍 Current implementation status: BASIC PROOF OF LIFE
🔍 Reference types being found: NONE (children only)
📊 Current 'references' (children only):
  1. /Users/byronwall/Projects/tasks-trpc/src/components/time-blocks/WeeklyCalendar.tsx:3076-3147 (() => {} [98-100]) - Category: ArrowFunction
```

**The system is only showing the direct hierarchical children** (the arrow function inside `handleNextWeek`), not actual code references/dependencies.

## **What You Expected vs What You Got**

| **Expected**                           | **Actually Got**       |
| -------------------------------------- | ---------------------- |
| Cross-file references (imports, calls) | Only direct children   |
| Dependencies to external modules       | Hierarchical structure |
| References outside the container       | Internal AST structure |
| A graph showing relationships          | A tree showing nesting |

## **The Missing Reference Types**

The logs even document what needs to be implemented:

```
🔍 Future reference types to implement:
  📤 Outgoing references (imports/calls from this node)
  📥 Incoming references (who imports/calls this node)
  👫 Sibling references (nodes at same level)
  🔄 Circular references (mutual dependencies)
```

## **Current Result**

- **ELK Graph**: 1 node, 0 edges
- **References Found**: None (just hierarchical children)
- **View**: Nested structure instead of reference graph

## **What Needs to Be Built**

To get the reference graph you want, the system needs to:

1. **Analyze the `handleNextWeek` variable** and find:

   - What functions/variables it calls (`setSelectedDate`, `addDays`, `numberOfDays`)
   - What modules it imports from
   - What other parts of the code reference it

2. **Build a true reference graph** with:

   - Nodes for each referenced entity
   - Edges showing the relationships
   - Cross-file dependencies

3. **Create a layout** that shows the relationship network, not just the hierarchical structure

The current implementation is essentially just showing you the AST structure (what's syntactically inside the node) rather than the semantic references (what the code actually depends on or references).

Would you like me to help implement the actual reference finding logic to make this work as you expected?

## TODO

- This is rendering something close to useful -- need to interrogate results on a much smaller code base - need to get much more detailed around expectations
- Way too many logs, strip them all out and focus on specific parts.

## Goals related to references

The goal of finding references is to be able to:

- Locate a `block of interest (BOI)`
- The BOI will be one of:
  - A variable declaration where the RHS side is an object, function call, array or other JS/TS expression
  - A standalone function call or other expression with no assignment
- Within the BOI, do the following:
  - Locate all variable usages
  - If a variable is declared in the BOI, then it's done and not interesting
  - If a variable comes from outside the BOI, then it's interesting and should be included in the reference graph
    - It will either resolve to a different location in the same file, or
    - An import from an external file.
  - Store the references in a data structure that can be used to render a graph
  - In particular, we want to store the hierarchy of how the references are related to each other and the BOI. This is the natural data structure of the existing treemap should it should be possible.
  - If a reference points to the BOI itself (recursively), then it should be included as a reference. We'll need to render a loopback.
- If the BOI is variable declaration, track down all usages of the variable and include them in the reference graph
- If the BOI is immediately destructured (object or array), then track down all usages of the destructured variables and include them in the reference graph
- For references going into the BOI, we need an edge created with an arrow pointing into the BOI.
- For references going out of the BOI (places where the BOI is used), we need an edge created with an arrow pointing out of the BOI.

## Current Implementation Analysis vs. Goals

### How the Current Reference Finding Algorithm Works

The current implementation in `layoutELK.ts` uses a **pattern-based text analysis approach** with the following components:

#### 1. **Reference Extraction (`extractReferencesFromSource`)**

- **Function Calls**: Uses regex `/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g` to find identifiers followed by `(`
- **Variable References**: Uses regex `/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b(?!\s*[=(])/g` to find identifiers not followed by `(` or `=`
- **Property Access**: Uses regex `/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\.\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g` to find `object.property` patterns
- **Keyword Filtering**: Excludes common language keywords (`const`, `let`, `if`, etc.)

#### 2. **Reference Resolution (`findNodesByName`)**

- **Label Matching**: Searches for nodes whose labels contain, start with, or exactly match the reference name
- **Source Content Matching**: Also checks if the target name appears in a node's source code
- **Recursive Search**: Traverses the entire node tree to find matches

#### 3. **Graph Construction (`buildReferenceGraph`)**

- **Scope**: Extracts references from the focus node AND all its children recursively
- **Self-Reference Filtering**: Excludes the focus node itself and its descendants from being targets
- **Node Limiting**: Caps the graph at 8 nodes for performance
- **Reference Deduplication**: Removes duplicate edges between the same source/target pairs

### Comparison Table: Current vs. Desired Behavior

| **Aspect**                             | **Current Implementation**                                     | **Desired Goals**                                                                                                           | **Gap Status**                                                |
| -------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Block of Interest (BOI) Definition** | Uses any `ScopeNode` as BOI, includes all children recursively | Any valid JS expression or block (function calls and variable declarations are common examples that produce outgoing edges) | ⚠️ **Partially Correct** - Right scope, wrong analysis method |
| **Variable Declaration Handling**      | Treats variable declarations like any other node               | Specifically handle variable declarations with RHS analysis                                                                 | ❌ **Missing** - No special handling                          |
| **Source vs. External Analysis**       | No distinction between internal/external references            | Only interested in references coming from OUTSIDE the BOI                                                                   | ❌ **Critical Gap** - No internal/external filtering          |
| **Reference Direction**                | Only finds outgoing references (what BOI uses)                 | Both outgoing (BOI → external) AND incoming (external → BOI)                                                                | ⚠️ **Partial** - Missing incoming references                  |
| **Destructuring Support**              | No special handling for destructured variables                 | Track destructured variables and their usage patterns                                                                       | ❌ **Missing** - No destructuring analysis                    |
| **Recursive Reference Detection**      | Filters out self-references completely                         | Include recursive references with loopback visualization                                                                    | ❌ **Opposite Behavior** - Excludes instead of including      |
| **Import Analysis**                    | Has `import` type but no actual import extraction              | Resolve references to imports from external files                                                                           | ❌ **Incomplete** - Type exists but not implemented           |
| **Reference Resolution Method**        | Text-based pattern matching with tree search                   | Semantic analysis with proper symbol resolution                                                                             | ❌ **Fundamental Gap** - No semantic understanding            |
| **Scope Boundary Awareness**           | No concept of variable scope or declaration context            | Understands when variables are declared within vs. outside BOI                                                              | ❌ **Missing** - No scope analysis                            |
| **Edge Types**                         | Single generic edge type                                       | Distinguish between reference directions (in/out)                                                                           | ❌ **Missing** - No directional semantics                     |
| **Performance Constraints**            | Hard limit of 8 nodes, basic deduplication                     | Intelligent prioritization of most relevant references                                                                      | ⚠️ **Crude** - Arbitrary limits vs. smart filtering           |

### Detailed Gap Analysis

#### 🔴 **Critical Gaps**

1. **Incorrect BOI Analysis Method**: The current system treats any node as a reference source but uses the wrong analysis approach. Any valid JS expression or block can be a BOI, but the analysis should focus on scope boundaries rather than including all children recursively.

2. **Missing Internal vs. External Analysis**: The most fundamental gap - the system doesn't distinguish between:

   - Variables declared within the BOI (should be ignored)
   - Variables coming from outside the BOI (should be tracked)

3. **No Semantic Understanding**: Uses text patterns instead of proper AST analysis to understand:

   - Variable scopes and declarations
   - Import statements and their targets
   - Function parameter definitions vs. usage

4. **Wrong Self-Reference Behavior**: Currently excludes self-references, but goals require including recursive references with loopback edges.

#### 🟡 **Significant Gaps**

5. **Missing Incoming References**: Only tracks what the BOI references, not what references the BOI.

6. **No Import Resolution**: While the type exists, there's no actual logic to extract and resolve import statements.

7. **No Destructuring Support**: Cannot track destructured variables like `const { a, b } = obj`.

8. **Crude Performance Limiting**: Uses arbitrary node limits instead of intelligent relevance-based filtering.

#### 🟢 **Working Aspects**

9. **Basic Reference Extraction**: The regex patterns do find function calls and variable references.

10. **Node Resolution**: The tree search does find nodes by name (though not semantically accurate).

11. **Graph Structure**: The ELK integration and data structures are properly set up.

### Recommendations to Close the Gaps

#### **Phase 1: Semantic Foundation (High Priority)**

1. **Implement Proper AST Analysis**

   ```typescript
   // Replace regex-based extraction with AST traversal
   function extractReferencesFromAST(
     node: ts.Node,
     sourceFile: ts.SourceFile
   ): SemanticReference[];
   ```

2. **Add Variable Scope Analysis**

   ```typescript
   interface VariableScope {
     declarations: Map<string, ts.Node>;
     parent?: VariableScope;
   }
   ```

3. **Implement BOI Scope Analysis**

   ```typescript
   function analyzeBOI(node: ScopeNode): BOIAnalysis {
     // Any valid JS expression or block can be a BOI
     // Focus on analyzing scope boundaries and variable usage patterns
     return {
       scopeBoundary: extractScopeBoundary(node),
       internalDeclarations: findInternalDeclarations(node),
       externalReferences: findExternalReferences(node),
     };
   }
   ```

#### **Phase 2: Reference Direction Analysis (High Priority)**

4. **Internal vs. External Reference Detection**

   ```typescript
   function categorizeReference(
     ref: string,
     boiScope: VariableScope
   ): "internal" | "external" {
     return boiScope.declarations.has(ref) ? "internal" : "external";
   }
   ```

5. **Bidirectional Reference Finding**

   ```typescript
   interface ReferenceGraph {
     outgoing: Reference[]; // BOI uses external variables/functions (common in function calls, variable declarations)
     incoming: Reference[]; // External code references variables declared within BOI scope
     recursive: Reference[]; // BOI → BOI (recursive function calls, etc.)
   }
   ```

#### **Phase 3: Advanced Features (Medium Priority)**

6. **Import Resolution Integration**

   ```typescript
   // Use VS Code's definition provider as originally planned
   async function resolveImportTarget(
     identifier: string,
     position: Position
   ): Promise<Location>;
   ```

7. **Destructuring Analysis**

   ```typescript
   function analyzeDestructuring(
     pattern: ts.BindingPattern
   ): DestructuredVariable[];
   ```

8. **Smart Reference Prioritization**

   ```typescript
   function prioritizeReferences(refs: Reference[]): Reference[] {
     // Sort by relevance, frequency, proximity, etc.
   }
   ```

#### **Phase 4: Performance & Polish (Lower Priority)**

9. **Incremental Graph Expansion**

   - Only load references when explicitly requested
   - Cache semantic analysis results
   - Implement proper cycle detection

10. **Enhanced Edge Visualization**
    - Different edge styles for different reference types
    - Directional arrows indicating reference flow
    - Edge labels showing reference context

#### **Immediate Action Items**

1. **Replace `extractReferencesFromSource` with proper TypeScript AST analysis**
2. **Implement variable scope tracking to distinguish internal vs. external references**
3. **Add BOI scope analysis to focus on scope boundaries rather than recursive children**
4. **Modify `buildReferenceGraph` to handle bidirectional references**
5. **Update the reference resolution to use semantic analysis instead of text matching**

### Summary

The current implementation is essentially a proof-of-concept that demonstrates the ELK integration and UI framework, but lacks the semantic understanding needed to fulfill the reference analysis goals. The gaps are significant but addressable through systematic implementation of proper AST analysis and scope-aware reference resolution.

The fundamental issue is that the current system uses text pattern matching where it needs semantic analysis. This results in finding textual matches rather than true code dependencies, and missing the critical distinction between internal and external references. Additionally, the current approach of recursively including all children misses the key insight that any JS expression or block can be a BOI, but the analysis should focus on scope boundaries to properly identify outgoing references (where the BOI uses external variables) and incoming references (where external code uses variables declared within the BOI scope).
