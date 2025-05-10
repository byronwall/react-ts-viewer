# Treemap ideas

I have code below that is used to parse TS and TSX code. It builds out various details related to imports and hooks usage. I woudl like to modify the code to support the following:

- Generate a tree map of the code where each nesting level and change of scope represents a new container in the tree map. So a fully procedural math file would be a bunch of small blocks at the same level. A deeply nested mess would include a bunch of nested blocks
- Assume that code gets organized by scope or nesting level, not really lines
- Maintain a link to the original line + col range for the block in question - I want to be able to quickly refer to the blocks
- Include in the data structure useful info about the node type like: function call, control flow, variable declaration, React comp, React hook etc. Make that part extensible somehow.
- Take or leave as much code as possible, but it does work for import/export. My goals are changing to do line level analysis of the code.
- In the data strictures, include enough info to fully rebuild the code -- include the original source code

## Idea + code structure

**Modifying code for tree map generation**

The user wants to adjust a codebase that currently builds a React Flow graph. The aim is to generate a tree map based on scope nesting rather than line-by-line. The user wants to maintain metadata like line and column ranges, data about node types (like function calls and control flow), and ensure extensibility for future modifications. I'll also focus on line-level analysis and ensure the data structures retain enough information to rebuild the entire code, though some logic (like imports/exports) can be omitted.

**Modifying code for TreeMap generation**

The user wants modifications to parse TS/TSX code into an AST, representing nested scopes as nodes in a tree map rather than a graph. The tree map node needs specific fields (e.g., id, type, name, location, children, source code). I'll need to design structures like the `TreemapNode` to include things like metadata for React components or hooks. We'll adjust the builder logic to traverse recursively and capture different scopes (functions, classes, blocks) while keeping track of line numbers and including snippets for reference. The goal is to focus on line-level analysis.

**Outlining necessary code modifications**

I'll start by outlining the high-level steps for the user's request. The goal is to create new data structures and functions for parsing and organizing the code into a tree map.

I'll introduce a `TreemapNode` interface, along with a function called `buildTreemapForFile()` that takes in the file, parses it, computes and organizes nodes, then returns the root of the tree. We'll also adapt the process to include React component detection and hook usage.

I'll represent this with code snippets and a more modular structure for reuse, meeting the user's preference to focus on code blocks and bullet points.

Thought for 54 seconds

Below is a drop-in _pattern_ you can graft onto the existing file-dependency graph without ripping it apart.
I've kept all the tsconfig / path-resolution helpers intact and introduced a **parallel "scope tree" layer** that you can feed straight into D3 treemap (or any layout of your choice).

---

### 1 — New, extensible data-model

```ts
// Position helper
export interface Position {
  line: number; // 1-based
  column: number; // 0-based
}

// Top-level enum you can grow at will
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
  Other = "Other",
}

// Hierarchical node that powers the treemap
export interface ScopeNode {
  id: string; // `${file}:${start}-${end}`
  kind: ts.SyntaxKind; // raw TypeScript kind
  category: NodeCategory; // high-level bucket
  label: string; // human-readable (e.g. function name)
  loc: { start: Position; end: Position };
  source: string; // exact slice of original text
  value: number; // #chars or LOC — used by treemap layout
  meta?: Record<string, any>; // hooks, props, anything extra
  children: ScopeNode[];
}
```

_Why this shape?_

- `kind` lets you drop straight to TS APIs if you need low-level power.
- `category` is the "opinionated" layer – feel free to swap the enum for a plugin registry.
- `source` + `loc` give you perfect round-trip fidelity (syntax-highlight, inline diffing, copy/paste, etc.).

---

### 2 — Scope-boundary detector

```ts
function isScopeBoundary(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isModuleBlock(node) ||
    ts.isClassLike(node) ||
    ts.isFunctionLike(node) ||
    ts.isBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node)
  );
}
```

> **Tweak** the list to taste — the rule is simple: "opening a new curly/semantic context? It's a container".

---

### 3 — Categoriser (pluggable)

```ts
function mapKindToCategory(node: ts.Node, parent?: ts.Node): NodeCategory {
  if (ts.isSourceFile(node)) return NodeCategory.Program;
  if (ts.isModuleDeclaration(node)) return NodeCategory.Module;
  if (ts.isClassLike(node)) return NodeCategory.Class;
  if (ts.isArrowFunction(node)) return NodeCategory.ArrowFunction;
  if (ts.isFunctionLike(node)) return NodeCategory.Function;
  if (ts.isBlock(node)) return NodeCategory.Block;
  if (ts.isVariableDeclaration(node)) return NodeCategory.Variable;
  if (
    ts.isIfStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isIterationStatement(node, false)
  )
    return NodeCategory.ControlFlow;
  if (ts.isCallExpression(node)) {
    const ident = node.expression.getText();
    if (/^use[A-Z]/.test(ident)) return NodeCategory.ReactHook;
    return NodeCategory.Call;
  }
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
    return NodeCategory.JSX;

  // Heuristic: function returning JSX ⇒ React component
  if (
    ts.isFunctionLike(node) &&
    node.body &&
    ts.forEachChild(node.body, (c) => (ts.isJsxChild(c) ? true : undefined))
  )
    return NodeCategory.ReactComponent;

  return NodeCategory.Other;
}
```

_Add/replace rules without touching callers._

---

### 4 — Tree-builder (single pass)

```ts
export function buildScopeTree(
  filePath: string,
  fileText: string = fs.readFileSync(filePath, "utf8")
): ScopeNode {
  const sf = ts.createSourceFile(
    filePath,
    fileText,
    ts.ScriptTarget.Latest,
    true
  );

  const root: ScopeNode = {
    id: filePath,
    kind: sf.kind,
    category: NodeCategory.Program,
    label: path.basename(filePath),
    loc: {
      start: { line: 1, column: 0 },
      end: lineColOfPos(sf, fileText.length),
    },
    source: fileText,
    value: fileText.length,
    children: [],
  };

  walk(sf, root);
  return root;

  // ---------- helpers ----------
  function walk(node: ts.Node, parent: ScopeNode) {
    // Only start a new treemap rectangle at *scope boundaries*
    const container = isScopeBoundary(node) ? createNode(node, parent) : parent;
    ts.forEachChild(node, (child) => walk(child, container));
  }

  function createNode(node: ts.Node, parent: ScopeNode): ScopeNode {
    const startPos = node.getStart(sf, /*includeJsDoc*/ true);
    const endPos = node.getEnd();
    const loc = {
      start: lineColOfPos(sf, startPos),
      end: lineColOfPos(sf, endPos),
    };
    const id = `${filePath}:${startPos}-${endPos}`;
    const source = fileText.slice(startPos, endPos);
    const newNode: ScopeNode = {
      id,
      kind: node.kind,
      category: mapKindToCategory(node, undefined),
      label: deriveLabel(node),
      loc,
      source,
      value: endPos - startPos, // char length – simple, works for treemap
      meta: collectMeta(node),
      children: [],
    };
    parent.children.push(newNode);
    return newNode;
  }

  // Position helpers
  function lineColOfPos(sf: ts.SourceFile, pos: number): Position {
    const lc = sf.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, column: lc.character };
  }

  function deriveLabel(node: ts.Node): string {
    if ("name" in node && node.name && ts.isIdentifier(node.name))
      return node.name.text;
    if (ts.isCallExpression(node)) return node.expression.getText(sf);
    return ts.SyntaxKind[node.kind];
  }

  // Harvest extra info that doesn't belong in the core enum
  function collectMeta(node: ts.Node): Record<string, any> | undefined {
    if (mapKindToCategory(node) === NodeCategory.ReactHook) {
      return { hookName: node.expression.getText(sf) };
    }
    if (mapKindToCategory(node) === NodeCategory.ReactComponent) {
      return {
        props: node.parameters?.map((p) => p.name.getText(sf)) ?? [],
      };
    }
    return undefined;
  }
}
```

_Plug-n-play_: the function returns one **pure JSON object** – ideal for `d3.treemap()`, `react-flow`, or a VS Code Webview.

---

### 5 — Feeding a D3 treemap (one-liner)

```ts
import { hierarchy, treemap } from "d3-hierarchy";

const root = buildScopeTree("src/Foo.tsx");
const layout = treemap<ScopeNode>()
  .size([width, height])
  .paddingOuter(2)
  .paddingInner(1);

layout(hierarchy(root).sum((n) => n.value));
```

Use the `ScopeNode.category` to drive colour scales; `loc.start` / `loc.end` let you jump to the editor location; `source` lets you show a tooltip or inline diff.

---

### 6 — Keeping your existing code intact

- **No change** to the import/export indexer or dependency graph.
- **Add** a sibling service (`ScopeTreeService`) that wraps `buildScopeTree`.
- **Expose** both datasets in the extension side-panel:

  - Graph view → dependency edges (what you already have)
  - Treemap tab → nested-scope density

Because both share the same tsconfig + path-resolution helpers, you get consistent alias handling and on-demand parsing "for free".

---

### 7 — Next steps / ideas

- **Line-heat colouring** – replace `value` with `git blame` or complexity metrics.
- **Collapse tiny leaf nodes** (≤ N chars) to keep deep trees readable.
- **Plugin registry** – let callers inject `categorise(node)` & `collectMeta(node)` instead of hard-coding in the builder.
- **Bidirectional links** – keep a `Map<id, ScopeNode>` for instant lookup when the user clicks on the treemap.
- **Live editing** – since each node carries `source`, you can feed it into a virtual document and rebuild the AST on save.

---

You now have a minimal, **fully hierarchical** representation that:

- respects lexical scope boundaries,
- points back to exact line/col ranges,
- stores original text for round-tripping,
- and is extensible for any future React-specific or static-analysis metadata you want to bolt on.

## Integration Plan: Treemap Visualization

This plan outlines the steps to integrate the treemap visualization into the existing React Flow and TreeView setup, using **Nivo** for rendering.

**Phase 1: Data Generation (Extension Side - `src/` directory)**

_No changes to this phase. The `buildScopeTree.ts` file will generate the `ScopeNode` tree as previously defined. This structure, which includes `id`, `label`, `value`, and `children`, is suitable for Nivo treemaps._

**Phase 2: Webview Integration (Frontend Side - `src/webview/` directory)**

1. **Create New File: `src/webview/TreemapDisplay.tsx`** (or modify if already created based on D3)

   - **Purpose**: A React component to render the treemap using Nivo.
   - **Content**:

     - Import React, `useEffect`, `useCallback`.
     - Import `ResponsiveTreeMapCanvas` from `@nivo/treemap`.
     - Import the `ScopeNode` and `NodeCategory` types (from a shared types file or defined locally).
     - Import `vscodeApi` from a shared utilities file (e.g., `../vscodeApi`).
     - **Props**:
       - `data: ScopeNode;` (The root node of the scope tree. Nivo expects the root data object directly).
     - **Rendering Logic**:

       - The main part of the component will be returning the `<ResponsiveTreeMapCanvas />`.
       - **Nivo Component Props**:

         - `data={data}`: Pass the root `ScopeNode`.
         - `identity="id"`: Tells Nivo to use the `id` field from our `ScopeNode` objects as the unique identifier.
         - `value="value"`: Tells Nivo to use the `value` field (character count or LOC) for sizing treemap cells.
         - `valueFormat=".02s"`: Formats the value displayed (e.g., in tooltips), as per the user's example.
         - `leavesOnly={true}`: Renders only leaf nodes, as per the user's example. This could be set to `false` if parent nodes should also be visualized directly in the treemap.
         - `margin={{ top: 10, right: 10, bottom: 10, left: 10 }}` (from user example)
         - `labelSkipSize={18}` (from user example)
         - `labelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}` (from user example)
         - `colors={{ scheme: 'spectral' }}` (from user example). Alternatively, a function can be used for category-based coloring: `(node) => colorScaleForCategory(node.data.category)`.
         - `colorBy="id"` (from user example). To color by category, use `(node) => node.data.category`.
         - `borderColor={{ from: 'color', modifiers: [['darker', 0.8]] }}` (from user example)
         - `onClick={(node) => { ... }}`:
           - The `node` object provided by Nivo contains `node.data` (our original `ScopeNode`).
           - Extract `filePath` and `loc`. The `filePath` can be obtained by parsing `node.data.id` (e.g., `node.data.id.split(':')[0]`).
           - `vscodeApi.postMessage({ command: 'revealCode', filePath: derivedFilePath, loc: node.data.loc });`
         - `tooltip={(params) => { ... }}`:

           - The `params` object contains `node`, where `node.data` is our `ScopeNode`.
           - Return a custom JSX element for the tooltip. Example:

             ```tsx
             tooltip={({ node }) => (
               <div style={{ /* Basic styling for tooltip */ }}>
                 <strong>{node.data.label}</strong> ({node.data.category})<br />
                 Value: {node.value}<br />
                 <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                   {node.data.source.substring(0, 150)}
                   {node.data.source.length > 150 ? '...' : ''}
                 </pre>
               </div>
             )}
             ```

   - The component itself will not require `width` and `height` props if `ResponsiveTreeMapCanvas` is used within a parent container in `App.tsx` that has defined dimensions.

2. **Modify `src/webview/App.tsx`**

   - **Imports**:
     - Import `TreemapDisplay` from `./TreemapDisplay`.
     - Ensure `ScopeNode` type is available.
   - **State Variables**: (Remain the same)
     - `activeView: 'graph' | 'treeview' | 'treemap';`
     - `scopeTreeData: ScopeNode | null;`
     - `isTreemapLoading: boolean;`
     - `treemapError: string | null;`
   - **Message Handling**: (Logic for `showScopeTree` and `showScopeTreeError` remains the same)
   - **Data Fetching Function** (`requestTreemapData`): (Remains the same)
   - **UI Changes (in `left-panel`)**: (Button/toggle logic remains the same)
   - **Conditional Rendering (in `right-panel`)**:

     - Ensure the container for `TreemapDisplay` has explicit dimensions.

       ```tsx
       <div
         className="right-panel"
         style={{ flex: 1, position: "relative", overflow: "hidden" }}
       >
         {isLoading && activeView === "graph" && (
           <div className="loading-overlay">Analyzing Dependencies...</div>
         )}
         {isTreemapLoading && activeView === "treemap" && (
           <div className="loading-overlay">Generating Treemap...</div>
         )}
         {treemapError && activeView === "treemap" && (
           <div className="error-overlay">{treemapError}</div>
         )}

         {activeView === "graph" && rawAnalysisData && (
           <FlowCanvas
             initialNodes={rawAnalysisData.nodes}
             initialEdges={rawAnalysisData.edges}
             settings={settings}
           />
         )}
         {/* activeView === 'treeview' logic if applicable */}
         {activeView === "treemap" && scopeTreeData && (
           // This parent div must have defined width and height for ResponsiveTreeMapCanvas
           <div
             style={{
               width: "100%",
               height: "calc(100vh - HEADER_HEIGHT_PX)" /* Adjust as needed */,
             }}
           >
             <TreemapDisplay data={scopeTreeData} />
           </div>
         )}
         {activeView === "treemap" &&
           !scopeTreeData &&
           !isTreemapLoading &&
           !treemapError && (
             <div className="placeholder-overlay">
               Select a file and trigger treemap analysis, or switch to this tab
               if data is ready.
             </div>
           )}
       </div>
       ```

     - Adjust `HEADER_HEIGHT_PX` or use flexbox/grid to ensure `100%` height works as expected within the `right-panel`.

3. **Modify Extension (e.g., `src/extension.ts`) for `revealCode`**
   - _No change from the previous D3-based plan regarding this part. The handler will receive `filePath` and `loc` and use VS Code APIs to reveal the range._

**Phase 3: Adjustments and Refinements**

- **Styling**:
  - CSS for view toggle buttons, general layout, and custom tooltips.
  - Nivo treemap elements are primarily styled via its props.
- **Error Handling**:
  - Provide clear feedback for treemap generation failures.
  - Handle potential issues with Nivo rendering if data is malformed.
- **Performance**:
  - `buildScopeTree` for very large files might be slow; consider optimizations or clear loading states.
  - Nivo is generally performant, but test with large datasets.
- **Code Sharing**:
  - Place `ScopeNode`, `NodeCategory`, `Position` types in a shared `types.ts` file accessible by both the extension and webview.
- **Dependencies**:

  - Ensure `@nivo/treemap` is added to the webview's `package.json`.

        ```bash
        # In your webview directory (e.g., src/webview)
        npm install @nivo/treemap
        # or
        yarn add @nivo/treemap
        ```

  - Nivo packages usually include their own type definitions.

- **State Management for `TreeView`**:
  - If `TreeView` is also a toggleable view in the `right-panel`, integrate its state and rendering logic similarly to `FlowCanvas` and `TreemapDisplay`.

This revised plan focuses on integrating Nivo for a responsive and customizable treemap visualization.

### Sample data

```json
{
  "id": "root",
  "children": [
    {
      "id": "node.0",
      "value": 11160
    },
    {
      "id": "node.1",
      "value": 31753
    }
  ]
}
```
