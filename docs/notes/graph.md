# FlowCanvas Component: Graph Operations and Data Flow Analysis

This document provides a detailed summary of the `FlowCanvas` React component, focusing on its graph operations, data flows, and layout mechanisms.

**1. Props and Initial State:**

- **`initialNodes: Node[]`**: An array of nodes provided by the parent component (`App`). These are the raw nodes before any layout is applied within `FlowCanvas`.
- **`initialEdges: Edge[]`**: An array of edges provided by the parent (`App`), corresponding to `initialNodes`.
- **`settings: AnalysisSettings`**: An object containing display and analysis settings (e.g., `showFileDeps`, `showLibDeps`, `showMinimap`) that influence graph rendering and visibility.
- **Internal State**:
  - `nodes: Node[]`: The current state of nodes, managed by `useState`. This state is updated after layout and visibility changes.
  - `edges: Edge[]`: The current state of edges, managed by `useState`, updated similarly to `nodes`.
- **`useReactFlow()`**: The `fitView` function is extracted from this hook to programmatically adjust the viewport.

**2. Layout Engine (ELK):**

- **`getLayoutedElements` Function**:
  - This function is responsible for orchestrating the layout process using the ELK.js library.
  - It takes `nodes`, `edges`, and optional ELK `options` as input.
  - **ELK Options**: Default options include:
    - `"elk.algorithm": "layered"`
    - `"elk.layered.spacing.nodeNodeBetweenLayers": "100"`
    - `"elk.spacing.nodeNode": "80"`
    - `"elk.direction": "DOWN"` (can be overridden, e.g., to "RIGHT" for horizontal layout).
  - **Node Transformation**: React Flow nodes are mapped to ELK's expected child format, including:
    - `targetPosition` and `sourcePosition` are set based on the layout direction (e.g., "left"/"top" for target, "right"/"bottom" for source).
    - `width` and `height` are assigned using `node.width ?? nodeWidth` (default `nodeWidth = 172`) and `node.height ?? nodeHeight` (default `nodeHeight = 100`).
  - **Edge Transformation**: React Flow edges are mapped to ELK's edge format (requiring `sources: [edge.source]` and `targets: [edge.target]`).
  - **ELK Execution**: `elk.layout(graph)` is called, which returns a promise.
  - **Result Processing**:
    - On success, the `layoutedGraph.children` (which are the ELK nodes with `x`, `y` coordinates) are mapped back to React Flow node format, updating their `position`.
    - The original `edges` are returned, as ELK typically doesn't modify edge structure in its basic return (unless bendpoints are configured).
    - Error handling is included for layout failures.
- **`useLayoutEffect` for Initial Layout**:
  - This effect runs when `initialNodes` or `initialEdges` change.
  - If `initialNodes` has items, it calls `getLayoutedElements(initialNodes, initialEdges)`.
  - On successful layout, it updates the internal `nodes` and `edges` state with the layouted versions.
  - It then calls `fitView({ duration: 300 })` (wrapped in `window.requestAnimationFrame`) to adjust the viewport to show the entire graph smoothly.
  - If `initialNodes` is empty, it clears the internal `nodes` and `edges` state.

**3. Node and Edge Visibility Management:**

- **`useEffect` for Visibility Updates**:
  - This effect runs whenever `settings`, `nodes` (the internal state, not `initialNodes`), or `edges` (internal state) change.
  - **Node Visibility**:
    - It iterates through the current `nodes` state.
    - A node's `hidden` property is set to `true` if:
      - `node.data?.type === "FileDep"` and `settings.showFileDeps` is `false`.
      - `node.data?.type === "LibDep"` and `settings.showLibDeps` is `false`.
    - It tracks if any node's visibility changed (`nodesChanged`).
  - **Edge Visibility**:
    - It iterates through the current `edges` state.
    - An edge's `hidden` property is set to `true` if:
      - Its `sourceNode` or `targetNode` (looked up in the potentially updated `nextNodes` list) is hidden.
      - The edge connects to a dependency node that is toggled off:
        - If `sourceNode?.data?.type === "Component"`:
          - And `targetNode?.data?.type === "FileDep"` and `!settings.showFileDeps`.
          - And `targetNode?.data?.type === "LibDep"` and `!settings.showLibDeps`.
    - It tracks if any edge's visibility changed (`edgesChanged`).
  - **Conditional State Update**: `setNodes` and `setEdges` are only called if `nodesChanged` or `edgesChanged` is true, respectively, to prevent unnecessary re-renders and potential loops.

**4. React Flow Core Integration:**

- **Event Handlers**:
  - `onNodesChange`: Uses `applyNodeChanges` to update the `nodes` state. This handles user interactions like dragging nodes.
  - `onEdgesChange`: Uses `applyEdgeChanges` to update the `edges` state. This handles interactions like selecting/deleting edges (though direct deletion isn't explicitly enabled via UI elements in `FlowCanvas` itself).
- **`nodeTypes`**:
  - A `useMemo` hook defines the mapping between node type strings and their corresponding React components:
    - `ComponentNode`: `ComponentNodeDisplay`
    - `FileNode`: `FileNodeDisplay`
    - `DependencyNode`: `DependencyNodeDisplay`
- **`<ReactFlow />` Component**:
  - Renders the graph using the internal `nodes` and `edges` state.
  - `fitView` prop: Initially present, but manual `fitView()` calls after layout provide more control.
  - `defaultEdgeOptions`: Sets `markerEnd: { type: MarkerType.ArrowClosed }` and `style: { strokeWidth: 1.5 }` for all edges.
  - **Controls**: Standard zoom/pan controls are added via `<Controls />`.
  - **Minimap**: `<MiniMap />` is conditionally rendered based on `settings.showMinimap`.
  - **Background**: A `<Background />` with `gap={12}` and `size={1}` is rendered.

**5. Data Flow Summary within `FlowCanvas`:**

1. **Input**: Receives `initialNodes`, `initialEdges`, and `settings` as props from the `App` component. `initialNodes` and `initialEdges` originate from `rawAnalysisData` in `App`.
2. **Layout Phase (`useLayoutEffect`)**:
   - `initialNodes`/`initialEdges` trigger `getLayoutedElements`.
   - ELK computes node positions.
   - Internal `nodes` and `edges` state are updated with layouted data.
   - `fitView()` is called.
3. **Visibility Phase (`useEffect`)**:
   - Changes to `settings` (from props) or the internal `nodes`/`edges` state (e.g., after layout) trigger this effect.
   - It iterates over current `nodes` and `edges`, calculating their `hidden` status based on `settings` (e.g., `showFileDeps`, `showLibDeps`) and the visibility of connected nodes.
   - If visibility changes, internal `nodes` and `edges` state are updated again.
4. **Rendering (`<ReactFlow />`)**:
   - The `ReactFlow` component consumes the latest internal `nodes` and `edges` state.
   - It uses `nodeTypes` to render custom node components.
   - Displays controls, minimap (conditional), and background.
5. **User Interaction**:
   - Direct interactions with the graph (e.g., dragging a node) trigger `onNodesChange` or `onEdgesChange`.
   - These handlers update the internal `nodes` and `edges` state via `applyNodeChanges` and `applyEdgeChanges`. This change then re-triggers the visibility `useEffect` due to `nodes`/`edges` being in its dependency array.

**Key Graph Operations Performed:**

- **Automated Layout**: Using ELK.js for hierarchical/layered graph drawing.
- **Dynamic Node/Edge Positioning**: Applying `x`, `y` coordinates from ELK.
- **Dynamic Visibility Control**: Show/hiding nodes and edges based on `settings` and inter-dependencies (an edge is hidden if its source/target is hidden).
- **Viewport Management**: Fitting the view to the graph after layout.
- **State Synchronization**: Keeping React Flow's internal state in sync with application-derived state (layouted nodes, visibility-filtered nodes/edges).
- **Custom Node Rendering**: Utilizing specific React components for different types of nodes.

## New plans

I want to:

- Modify the data structure so that hte main container correpsonds to a file or dependency.
- Inside the file, there shoudl be nodes for each of the export items, or other defined elements.
- For those defined elements, like a Component, they shoudl render info in a comp
- There should be no additional nodes or structures or containers related to deps.
- The grpah searhc shoudl include external libaries like react adn show them in teh grpah

## Scope of work

The following outlines the plan to refactor the graph visualization based on the new requirements:

**I. Data Structure & Analysis (Primarily Extension-Side Changes)**

1. **Revamp Extension Analysis Logic:**
   - The core analysis script (responsible for generating `rawAnalysisData`) must be significantly updated.
   - **Primary Entities:** Identify "File" and "External Library" (e.g., 'react', 'elkjs') as the main organizational units for the graph.
   - **File Internals:** For each "File" entity, parse and list its exported members (components, hooks, functions, variables, etc.) as distinct sub-elements.
   - **External Libraries:** Represent external libraries as entities. These could be simple nodes or potentially expandable containers if specific imported members from them are to be shown as sub-nodes in the future.
   - **Dependency Representation:** Eliminate the current `FileDep` and `LibDep` node types. Dependencies will now be implicit through edges connecting:
     - Exported members _within_ one file to exported members _in another_ file.
     - Exported members _within_ a file to an "External Library" entity (or its specific members, if applicable).
2. **Update `rawAnalysisData` Structure:**

   - The structure of nodes and edges sent to the webview must change to reflect the new hierarchy.
   - **Node Hierarchy:** Nodes will need to support a parent-child relationship to represent exported items within files, or files/libraries within a conceptual root.
     - React Flow's `parentNode` attribute can be used for this, which then needs to be correctly translated for ELK's hierarchical layout.
   - **New Node Types:** Introduce new node types and update existing ones:
     - `FileContainerNode`: Represents a file, acts as a parent/container for its exported items.
     - `LibraryContainerNode`: Represents an external library.
     - `ExportedItemNode`: A generic type for items within a file (e.g., `ComponentItem`, `HookItem`). Data payload should distinguish the specific kind of export.
   - **Edge Adjustments:** Edges will now connect `ExportedItemNode`s to each other (for intra-file or inter-file relationships) or link `ExportedItemNode`s to `LibraryContainerNode`s.

   - **Comparison with `TreeView.tsx` (`TreeNodeData`) for `rawAnalysisData`:**
     - The goal is for the revamped `rawAnalysisData` to be the single source of truth, processable by both `FlowCanvas` (for graph rendering) and `TreeView.tsx` (for the tree display) with minimal specific transformations.
     - **Hierarchical Structure:**
       - Graph: Achieved using React Flow's `parentNode` attribute, which ELK will interpret for layout.
       - TreeView: Uses an explicit `children: TreeNodeData[]` array within its `TreeNodeData` interface.
       - `rawAnalysisData` should facilitate creating both representations (e.g., a list of items with optional parent IDs or nested structures that can be flattened or directly used).
     - **File Representation:**
       - Graph: `FileContainerNode`.
       - TreeView: `TreeNodeData { type: "File" }`.
       - `rawAnalysisData` items representing files will map to these.
     - **Library Representation:**
       - Graph: `LibraryContainerNode` (e.g., for 'react').
       - TreeView: `TreeNodeData { type: "LibraryReferenceGroup" }` (e.g., 'react') which contains `TreeNodeData { type: "LibraryImport" }` children (e.g., 'useState').
       - `rawAnalysisData` for libraries should ideally allow the graph's `LibraryContainerNode` to correspond to `TreeView`'s `LibraryReferenceGroup`. If the graph also needs to show individual imports as nodes, these would be child `ExportedItemNode`s of the `LibraryContainerNode`, analogous to `TreeView`'s `LibraryImport`.
     - **Exported/Internal Items (Components, Hooks, etc.):**
       - Graph: Generic `ExportedItemNode`. Its `data` payload (e.g., `data.actualType = 'Component'`) will specify the kind of item.
       - TreeView: Specific types like `TreeNodeData { type: "Component" }`, `TreeNodeData { type: "Hook" }`.
       - The `data` payload of an `ExportedItemNode` in `rawAnalysisData` will directly map to these specific `TreeView` types.
     - **Dependencies (Edges vs. `UsedComponent`):**
       - Graph: Dependencies between `ExportedItemNode`s (or to `LibraryContainerNode`s) will be represented by `Edge` objects in `rawAnalysisData`.
       - TreeView: Uses `TreeNodeData { type: "UsedComponent" }` to show components/libraries used by another component, often nested under it.
       - The analysis that identifies `UsedComponent`s for `TreeView` (and their `dependencyType: 'internal' | 'external'`, `referenceSource`) is the _same underlying analysis_ needed to generate the `source` and `target` for graph edges in `rawAnalysisData`.
     - **`filePath` attribute:** Consistently used in both to link nodes to their source files.
     - **Obsolete TreeView Types for Graph:** `TreeView`'s presentational types like `HooksContainer` or `ReferencesContainer` are for visual grouping in the tree and likely won't have direct node equivalents in the graph data, though the items they contain (hooks, references) are relevant for `ExportedItemNode`s or edge generation.

**II. React Flow Rendering & Logic (`FlowCanvas` in `src/webview/App.tsx`)**

1. **Adapt `getLayoutedElements` for Hierarchical Layout (ELK):**
   - Modify the ELK graph construction to support hierarchical layouts. This involves correctly passing the parent-child relationships from `rawAnalysisData` to ELK (e.g., using nested `children` arrays in ELK's graph structure or ensuring ELK understands compound nodes).
   - ELK options might need adjustment (e.g., for spacing within and between parent nodes).
   - Node dimensions (`nodeWidth`, `nodeHeight`) must become more dynamic. Container nodes (files, libraries) will likely have their dimensions determined by their content or by ELK. Individual item nodes might retain fixed sizes or have type-specific sizes.
2. **Update Node Types and Custom Display Components:**
   - **Create `FileContainerNodeDisplay`:** A React component to visually render the file container. This component will be responsible for displaying its child `ExportedItemNode`s.
   - **Create `LibraryContainerNodeDisplay`:** A React component for external library containers.
   - **Refactor/Create `ExportedItemNodeDisplay`:**
     - Modify `ComponentNodeDisplay` to become more generic for different types of exports or create specific displays (e.g., `HookItemDisplay`, `FunctionItemDisplay`) if their visual representation needs to differ significantly. These will render _inside_ their respective `FileContainerNode`.
   - **Remove Obsolete Displays:** `FileNodeDisplay` and `DependencyNodeDisplay` will no longer be needed.
3. **Adjust Edge Rendering and Visibility Logic:**
   - Ensure edges correctly connect the new `ExportedItemNode`s or link them to `LibraryContainerNode`s, potentially targeting the containers or specific items if the hierarchy is deep.
   - The `useEffect` hook in `FlowCanvas` that manages node/edge visibility based on `settings` needs a complete overhaul:
     - The logic for hiding nodes based on `node.data?.type === "FileDep"` or `"LibDep"` will be removed.
     - Visibility will depend on `settings` like `showHooks` (to hide/show `HookItem` nodes _within_ files) and potentially new settings if, for example, all external library connections need to be toggled.
     - An edge should be hidden if either its source or target `ExportedItemNode` is hidden, or if their parent `FileContainerNode`s / `LibraryContainerNode`s are hidden.
4. **Re-evaluate `AnalysisSettings`:**
   - `showFileDeps`: This setting is likely obsolete as file dependencies are now intrinsic to the structure.
   - `showLibDeps`: This could be repurposed to toggle the visibility of all `LibraryContainerNode`s and their associated edges.
   - `showHooks`: This will now apply to `ExportedItemNode`s of type 'Hook' within file containers.
   - Consider if new settings are needed for the new structure (e.g., collapsing/expanding file containers by default).
5. **Update UI Controls (Settings Panel):**
   - Modify the settings panel in `App.tsx` to reflect changes to `AnalysisSettings`. Remove controls for obsolete settings and add any new ones.

**III. `TreeView` Component Update (`src/webview/TreeView.tsx`)**

1. **Adapt to New Data Structure:**
   - The `TreeView` component consumes `rawAnalysisData` to display a hierarchical list. It must be updated to understand and correctly render the new nested structure of files containing exported items.
   - This will likely involve recursive rendering of tree nodes to display the hierarchy accurately.

**IV. General Refactoring & Cleanup**

1. **Remove Obsolete Code:** Thoroughly remove all code related to the old `FileDep` and `LibDep` node types from `App.tsx` and any other relevant files (e.g., state management, prop definitions, utility functions).
2. **Update Comments and Documentation:** Ensure all inline comments and any related documentation (like this `graph.md` file itself, once changes are implemented) are updated to reflect the new architecture and data flow.
3. **Testing:** Rigorously test the new implementation with various codebases to ensure layout stability, correct representation of structures, and proper functioning of visibility toggles.

This plan involves significant changes to both the data generation (extension side) and the frontend rendering (webview side).
