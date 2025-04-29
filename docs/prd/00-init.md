**React + TypeScript Code Analysis VS Code Extension — Requirements Specification**  
_(prepared for contracting an implementation team)_

| Area                            | High-level goal                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Core static analysis            | Precise, multi-file React/TS introspection (components, hooks, state, props, variables, imports/exports). |
| Visualization & UX              | Multi-view, clutter-free, interactive diagrams that stay usable in large projects.                        |
| Navigation & developer workflow | One-click jump-to-source and context-menu commands that fit naturally into daily coding.                  |
| Performance & scalability       | Background, incremental analysis that stays <200 ms for common tasks on a 1 k-file repo.                  |
| Configuration & extensibility   | Opinionated defaults plus clear, discoverable settings and JSON API hooks.                                |

---

### 1. Core static-analysis capabilities

- **Component topology**

  - Detect every React component (function + class, default + named exports, Higher-Order Components, `forwardRef`, `memo`) in `.tsx|.jsx|.ts|.js`.
  - Build a _directed_ graph: "_component A renders B_" by resolving JSX identifiers and default/namespace imports.
  - Represent repeated renders once (no duplicate nodes); aggregate call-sites with edge counters.

- **Hook & state inspection**

  - List **all hooks per component** with call-order (index) and arguments.
  - Highlight _custom hooks_; allow ⇧-click to open their implementation (drill-down).
  - Distinguish React built-ins (`useState`, `useEffect`, …) vs. library/store hooks (`useEditTaskStore`, Redux Toolkit, Zustand, Jotai, etc.).

- **Props & data-flow**

  - Extract prop _shape_ from TypeScript types / JSDoc; show required vs. optional.
  - Show **"where-used"**: given a prop or symbol, traverse up and down to find origin, transformations, and sinks.
  - Include _value-origin / value-destination tracing_ (JetBrains-style):
    - Forward slice: "who consumes this value?"
    - Backward slice: "who produced or last mutated this value?"
    - Works across files & async boundaries (`await`, Promises) with best-effort heuristics.

- **Dependency graph**

  - Detect _imports/exports_ (ESM + CommonJS) and cycles.
  - Option to toggle **external modules** ("end-of-line" nodes) on/off.
  - Show _what_ is imported (named bindings) not just _which file_.

- **TypeScript awareness**
  - Use the official TypeScript compiler API (or `ts-morph`) for AST resolution → strong guarantees on rename-safety.
  - Treat `.d.ts` references as externals to keep graphs clean.

---

### 2. Visualization & UX

- **Multiple coordinated views**

  - **Tree sidebar** (vertical, collapsible)
    - Folder → file → component/hook hierarchy.
    - Search-as-you-type filter.
    - Context actions: "Show graph from here", "Trace value...".
  - **Graph view (WebView)**
    - Uses ELK or Dagre for crisp layout; orthogonal edges; avoids "noodle spaghetti".
    - Zoom/pan, free-drag nodes, save/restore positions.
    - Edge direction arrows; label with import name or prop.
    - Node icons/colors by kind (component, hook, variable, external).
    - Click = reveal in editor; ⌥-click = isolate node; ⌘-click = remove node (undoable).
    - _Hide ES5 primitives_ and `node_modules` by default (toggleable).

- **Single-file inspector**

  - Quick-pick command "Analyze current file".
  - Inline tree of functions, imported variables, and JSX elements with badges (#hooks, #children, #props).

- **Incremental expansion**

  - Graph starts with selected node(s); _Shift-E_ expands one hop; _Shift-R_ recursively expands.

- **Color palette & theming**

  - Default palette passes WCAG AA contrast.
  - Allow users to map kinds → colors in settings.

- **Minimal modals / popovers**
  - Rely on VS Code's native dropdowns and panels—never open floating HTML dialogs unless unavoidable.

---

### 3. Navigation & workflow integration

- Editor gutter/code-lens links:
  - "Show component tree", "Trace to prop origin", "Jump to consumers".
- Command palette shortcuts for every major action.
- Peek panels (same UX as _Go to Definition_).
- Respect VS Code multi-root workspaces; allow selecting the _analysis context_ root or entry file quickly.
- Web-view provides _Copy as markdown diagram_ and _Export SVG/PNG_.

---

### 4. Performance & scalability

- Initial index performed **in worker thread**; progress bar & cancellation.
- File-watcher to update only affected slices on save.
- Cache AST & graph snapshots on disk (invalidate via hash of file contents).
- Memory target: <500 MB for 5 k files; fall back to lazy-load nodes if exceeded.

---

### 5. Configuration & settings

- **JSON-schema-backed** `settings.json` section with descriptions + default values.
  - `reactAnalysis.entryPoints` – array of globs; default `src/**/*.{tsx,jsx}`.
  - `reactAnalysis.hideExternals` – boolean.
  - `reactAnalysis.maxGraphNodes` – number; auto-collapse beyond.
  - … _(full schema delivered separately)._
- Settings UI: use VS Code's _contributes.configuration_ → exposes nice searchable GUI; placeholder text for every field.

- **Extension API / events**

  - Provide programmatic access (`vscode.commands.executeCommand('reactAnalysis.getGraph', uri)`) so other tools can consume data.

- **CLI bridge** (stretch goal)
  - `npx react-analysis --print-json src/App.tsx` for CI diagrams.

---

### 6. Non-functional & polish

- **Robust import resolution**
  - Handles `tsconfig.json` paths, Yarn / PNPM workspaces, barrel files, default exports.
- **Accessibility**: keyboard-only navigation; screen-reader labels for graph nodes.
- **Testing**: ship with sample monorepo to validate huge scale; snapshot tests for graphs.
- **Documentation**:
  - _Quick-start_ (2 min).
  - _Deep-dive_ (static analysis internals, API examples).
  - GIF demos of each view.

---

### 7. Out-of-scope (for v1, defer or plugin)

- Runtime profiling / bundle-size visualisation.
- Refactor actions (rename symbol, extract component).
- Non-React frameworks (Vue, Svelte).
- Live AST editing.

---

### 8. Deliverables & milestones

- **M0 — scaffolding**: extension activation, AST indexer POC.
- **M1 — tree view & single-file inspector**.
- **M2 — graph view with basic layout & navigation**.
- **M3 — value-origin/destination engine & where-used tracing**.
- **M4 — performance hardening, UI polish, documentation**.
- **M5 — public beta + telemetry opt-in**.

---

### 9. Tech stack recommendation

- Language: TypeScript 5.x.
- AST: `ts-morph` on top of TypeScript compiler APIs.
- Graph layout: **ELK** (preferred) or **Dagre** in WebView (via `wasm`).
- UI: VS Code TreeView API + WebView (React, Vite, no global CSS frameworks).
- State: `zustand` (small footprint).
- Testing: Vitest + Playwright for WebView.

---

### 10. Success criteria

- **<5 min** to install, index, and render an initial graph on a 500-file project.
- **Zero** blocking UI threads; editor stays responsive while indexing.
- **Accurate** component tree depth vs. runtime (validated against CRA sample, Next .js, Remix).
- Positive UX feedback compared to _Atomic Viz_ and _Chartographer_ pain-points:
  - Non-duplicated nodes, clean edge bundling, intuitive settings, no modal overload.

## Plans

Here's a high-level plan based on the specified milestones:

**M0 — Scaffolding: Extension Activation & AST Indexer POC**

1. **Project Setup**: Initialize a VS Code extension project using `yo code` (TypeScript template). Configure `package.json` with basic activation events (`onStartupFinished`, `onCommand`).
2. **Core Data Structures**: Define initial TypeScript interfaces for graph nodes (`ComponentNode`, `HookNode`, `FileNode`, etc.) and edges (`RenderEdge`, `ImportEdge`).
3. **AST Indexer POC**:
   - Integrate `ts-morph`.
   - Implement a basic `IndexerService` that can traverse a project (`Project` from `ts-morph`).
   - Create a function `parseFile(filePath: string): FileNode` that extracts top-level components and hooks from a single file using AST traversal. Focus on function/class declarations and common React patterns (`React.memo`, `forwardRef`).
   - Implement a command (`reactAnalysis.indexWorkspace`) that triggers the indexer for `reactAnalysis.entryPoints`. Log basic stats (files parsed, components found).
4. **Activation**: Ensure the extension activates and the index command runs.

**M1 — Tree View & Single-File Inspector**

1. **Tree View Implementation**:
   - Create a `SidebarProvider` implementing `vscode.TreeDataProvider<TreeNode>`.
   - Define `TreeNode` types (Folder, File, Component, Hook).
   - Populate the tree based on the indexer data (initially a simple hierarchy). Add icons.
   - Implement `getChildren`, `getTreeItem`.
   - Register the TreeView in `package.json` under `contributes.views`.
2. **Search/Filter**: Add a search input above the tree (or use VS Code's built-in filtering if sufficient).
3. **Context Actions**: Add basic context menu items ("Reveal in Editor").
4. **Single-File Inspector**:
   - Implement `reactAnalysis.analyzeCurrentFile` command.
   - On activation, read the active editor's content, parse it using the `IndexerService`.
   - Display results (list of components, hooks, imports) in a temporary read-only document or output channel. (Refine UI later).

**M2 — Graph View with Basic Layout & Navigation**

1. **WebView Setup**:
   - Create a `GraphViewPanel` class to manage a `vscode.WebviewPanel`.
   - Set up basic HTML structure for the WebView. Include placeholders for graph rendering.
   - Implement message passing between the extension host and WebView (e.g., `postMessage`, `onDidReceiveMessage`).
2. **Graph Library Integration**:
   - Choose ELK (via WASM/JS port) or Dagre.
   - Set up the chosen library within the WebView's JavaScript context.
   - Define a `GraphData` interface (nodes, edges) to pass from the extension to the WebView.
3. **Basic Rendering**:
   - Implement `renderGraph(graphData: GraphData)` in the WebView's JS.
   - Render nodes as simple shapes/icons and edges as lines based on layout engine output.
   - Implement basic zoom/pan controls.
4. **Interaction**:
   - Implement click handling on nodes in the WebView.
   - On click, send a message back to the extension host (`{ command: 'revealFile', data: { filePath, line, column } }`).
   - The extension host handles the message and uses `vscode.window.showTextDocument`.
5. **Integration**: Add a command `reactAnalysis.showComponentGraph` (callable from TreeView context menu) that opens the graph view centered on the selected component. The `IndexerService` needs to provide component relationship data (A renders B).

**M3 — Value-Origin/Destination Engine & Where-Used Tracing**

1. **Tracing Logic (`AnalysisService`)**:
   - Develop core algorithms for:
     - **Component Rendering Resolution**: Enhance `IndexerService` to resolve JSX tags (`<B />` in component A) to their definition (component B), handling imports. Store this as `RenderEdge`s.
     - **Prop Shape Extraction**: Use `ts-morph` to get type information for component props (`TypeChecker` API).
     - **Backward Slice (Value Origin)**: Given a variable/prop (`ts.Node`), trace its assignments and declarations backward within and across files. Handle basic assignments, function calls, and parameter passing.
     - **Forward Slice (Value Destination)**: Trace where a variable/symbol is used (read, passed as argument).
   - Handle basic async patterns (`await`, `Promise`) with heuristics.
2. **API Definition**: Define functions like `traceValueOrigin(uri: vscode.Uri, position: vscode.Position): TraceResult[]` and `traceValueDestination(...)`.
3. **Integration**:
   - Add commands (`reactAnalysis.traceValueOrigin`, `reactAnalysis.traceValueDestination`) accessible via Command Palette and editor context menus.
   - Display results:
     - Initially in a list/quick-pick panel.
     - Enhance the Graph View to highlight traced paths or related nodes.
   - Add "Trace..." options to the TreeView context menu.

**M4 — Performance Hardening, UI Polish, Documentation**

1. **Background Indexing**:
   - Move the `IndexerService` logic into a worker thread (`worker_threads` in Node.js) to avoid blocking the extension host. Use message passing for communication.
   - Add progress indication (`vscode.window.withProgress`).
   - Implement cancellation.
2. **Incremental Updates**:
   - Use `vscode.workspace.createFileSystemWatcher` to monitor file changes (`.tsx`, `.jsx`, etc.).
   - On save, re-parse only the changed file and update the relevant parts of the index/graph data. Identify affected upstream/downstream nodes for partial updates.
3. **Caching**:
   - Implement disk caching for ASTs/index data (e.g., in `context.globalStorageUri`). Use file content hashes for cache invalidation.
   - Manage cache size/eviction.
4. **Scalability**: Implement `maxGraphNodes` limit with auto-collapse/summarization logic if exceeded. Test with large projects.
5. **UI Polish**:
   - Refine Graph View aesthetics (node styles, edge routing, layout parameters).
   - Improve Tree View (icons, badges).
   - Implement configuration options (`settings.json`, Settings UI using `contributes.configuration`).
   - Ensure WCAG AA contrast.
6. **Documentation**: Write Quick Start, Deep Dive, and API docs. Create GIF demos.

**M5 — Public Beta + Telemetry Opt-In**

1. **Testing**:
   - Add comprehensive unit/integration tests (`Vitest`).
   - Set up end-to-end tests for the WebView (`Playwright`).
   - Test against sample projects (CRA, Next.js, Remix, monorepo).
   - Snapshot tests for graph structures.
2. **Telemetry**:
   - Integrate `vscode-extension-telemetry`.
   - Add opt-in setting (`reactAnalysis.enableTelemetry`).
   - Track key events (command usage, errors, performance metrics) anonymously.
3. **Packaging & Release**:
   - Set up CI/CD (e.g., GitHub Actions) to build, test, and package (`vsce package`).
   - Prepare marketplace listing.
   - Announce public beta.
4. **CLI Bridge (Stretch Goal)**: If time permits, create a simple CLI wrapper (`npx react-analysis ...`) using the core `IndexerService` and `AnalysisService`.

This plan focuses on iterative delivery, starting with core functionality and progressively adding features, performance improvements, and polish.
