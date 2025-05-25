# TODO

## Overall extension

- Save the index results to disk
- Publish to npm + VS Code Marketplace
- Create a README with features and other details

## Biggest annoyances

- Graph view is awful

## Main web view

- Allow user to select a new file with a fuzzy picker dialog (like how move file works)
- Allow the side pane to be resized
- Show the relative file path in the input box
- Results are cleared when losing focus - or seem to be reloaded?

## Detailed react analysis

- Need to show the props coming into a comp
- Show the fields coming into a hook and compare against the deps array
- (End goal is to support quickly refactoring hooks into their own files)
- Ability to detect a `useContext` and show how the context is being used
- Same ability to detect a global state management library and show how it is being used (like zustand or react-query)
- Need to break down the calls inside a comp, before the return statement - want to see how complicated the chain of hooks is -- a good visuals would be blocks of color showing how calls are "stacked" to produce the comp - the goal of this structure is to make it easier to refactor long lines of code into dedicated hooks

## Structure view

- Clicking on a node in structure view should focus the graph on that node -- double clicking should navigate VS Code to the file (open the editor, ideally at the correct line)
- When a file only has a single export, collapse to a single line in the structure view (show both the file name and the export name)
- Show the originating file at the top of structure view (want to focus on the one that triggered the analysis)
- Revise structure view labels to show `H` or `C` for hooks and components and `F` for files -- do this in a way that is easily extendable to other types
- Need to style external deps different from internal deps
- Need to identify aliased deps as internal deps - almost there?
- Find all refs is often finding the props interface instead of the actual component export -- appears to be doing dumb string matching
- If we can programmatically trigger the find all refs, we could show the results in the tree view
- If the tree view is decent - embed it into the graph view as the contents - then use edges to show how that comp or file relates to other stuff

## File layout overview

- Generate a visual that renders the source code file as an image of colored blocks that represent the code - the goal is to show the flow of the code through the file
- Specifically, I want to see how data flows through the file from chunk to chunk
- Could also render as a tree or graph showing how data flows down the files
- Then once it gets the to JSX part, show how data flows down the JSX tree

## Graph layout problems

- Need to consider dynamic height + width: <https://github.com/xyflow/xyflow/issues/991>

## Treemap related

- Better default visuals
  - Console statements should be a dull color - detect special
- Tree building
  - Review what happens in a `.d.ts` file and add necessary types - seeing `Other:`
  - Differentiate between real and `type` imports
  - Find some way to include prop attributes as a node type (help show JSX stuff)
  - Improve handling on typescript defs inside interfaces, gives `Other: FunctionType`
- Visuals
  - Limit the size of the tree on small node counts - really want to have it make sense instead of filling screen
  - Find some way to prefer nodes that are slightly wider than taller (render more text)
- Arrow funcs need some love
  - Show the parameters or the return (maybe a signature)
- Expand into other file types
  - A view of markdown would be nice
  - CSS/SCSS
  - Works oddly well for HTML - consider improving colors with subtle variation
- For an array of nodes, consider showing the first 10 or something
- Improve results for export or barrel file
- Web view needs to work without resetting state
- Reset the depth display to 0 when changing files - do not include in saved state
- Get the keyboard shortcuts working with a common handler - do not accept when focus is in the search input

### Barrel file

```jsx
// export * from "./button/button";
export * from "./chart/chart";
export * from "./collapsible/collapsible";
export * from "./combobox/raw-search-box";
export * from "./menu/menu";
export * from "./slot";
export * from "./tooltip";
```

### Array example

Example of arrays that might be nice to render a subset:

```jsx
import { Node, Edge, MarkerType } from "@xyflow/react";

export const nodes: Node[] = [
  // — Annotations
  {
    id: "annotation-define",
    type: "annotation",
    draggable: false,
    selectable: false,
    data: {
      level: 1,
      label: "You define it",
      arrowStyle: {
        left: 0,
        bottom: 0,
        transform: "translate(120px, 30px) scale(1, -1) rotate(90deg)",
      },
    },
    position: { x: 300, y: -20 },
  },
  {
    id: "annotation-execute",
    type: "annotation",
    draggable: false,
    selectable: false,
    data: {
      level: 2,
      label: "We execute it",
      arrowStyle: {
        left: 0,
        bottom: 0,
        transform: "translate(120px, 30px) scale(1, -1) rotate(90deg)",
      },
    },
    position: { x: 1075, y: -20 },
  },

  // — Group: “Define”
  {
    id: "group-define",
    type: "group",
    position: { x: 0, y: 0 },
    style: { width: 900, height: 350 },
    data: {},
  },

  // — Libraries subgroup
  {
    id: "group-libraries",

    parentId: "group-define",
    extent: "parent",
    position: { x: 20, y: 20 },
    style: { width: 200, height: 260 },
    data: {},
  },
  {
    id: "rai-predict",
    type: "default",
    parentId: "group-libraries",
    extent: "parent",
    data: { label: "RAI Predict" },
    position: { x: 40, y: 60 },
    style: { width: 140, height: 40 },
  },
  {
    id: "rai-graph",
    type: "default",
    parentId: "group-libraries",
    extent: "parent",
    data: { label: "RAI Graph" },
    position: { x: 40, y: 120 },
    style: { width: 140, height: 40 },
  },
  {
    id: "rai-optimize",
    type: "default",
    parentId: "group-libraries",
    extent: "parent",
    data: { label: "RAI Optimize" },
    position: { x: 40, y: 180 },
    style: { width: 140, height: 40 },
  },
  {
    id: "rai-llm",
    type: "default",
    parentId: "group-libraries",
    extent: "parent",
    data: { label: "RAI LLM" },
    position: { x: 40, y: 240 },
    style: { width: 140, height: 40 },
  },

  // — Rest of “Define”
  {
    id: "query-builder",
    type: "default",
    parentId: "group-define",
    extent: "parent",
    data: { label: "Query Builder" },
    position: { x: 260, y: 120 },
    style: { width: 160, height: 60 },
  },
  {
    id: "modeler",
    type: "default",
    parentId: "group-define",
    extent: "parent",
    data: { label: "Modeler" },
    position: { x: 260, y: 240 },
    style: { width: 160, height: 60 },
  },
  {
    id: "metamodel",
    type: "default",
    parentId: "group-define",
    extent: "parent",
    data: { label: "Metamodel" },
    position: { x: 500, y: 180 },
    style: { width: 160, height: 60 },
  },
  {
    id: "compiler",
    type: "default",
    parentId: "group-define",
    extent: "parent",
    data: { label: "Metamodel Compiler" },
    position: { x: 700, y: 180 },
    style: { width: 160, height: 60 },
  },

  // — Group: Target Backends
  {
    id: "group-backends",
    position: { x: 800, y: 80 },
    style: { width: 200, height: 360 },
    data: {},
  },
  {
    id: "backend-sql",
    type: "default",
    parentId: "group-backends",
    extent: "parent",
    data: { label: "SQL" },
    position: { x: 820, y: 120 },
    style: { width: 140, height: 40 },
  },
  {
    id: "backend-rel",
    type: "default",
    parentId: "group-backends",
    extent: "parent",
    data: { label: "Rel" },
    position: { x: 820, y: 180 },
    style: { width: 140, height: 40 },
  },
  {
    id: "backend-lqp",
    type: "default",
    parentId: "group-backends",
    extent: "parent",
    data: { label: "LQP" },
    position: { x: 820, y: 240 },
    style: { width: 140, height: 40 },
  },
  {
    id: "backend-python",
    type: "default",
    parentId: "group-backends",
    extent: "parent",
    data: { label: "Python" },
    position: { x: 820, y: 300 },
    style: { width: 140, height: 40 },
  },

  // — Execution Plan
  {
    id: "exec-plan",
    type: "default",
    data: { label: "Execution Plan" },
    position: { x: 1025, y: 180 },
    style: { width: 160, height: 60 },
  },

  // — Group: Native App (wraps Orchestrator, Ingest, ERP & Engines)
  {
    id: "group-native-app",
    type: "group",
    position: { x: 1200, y: 80 },
    style: { width: 360, height: 600 },
    data: {},
  },
  {
    id: "orchestrator",
    type: "default",
    parentId: "group-native-app",
    extent: "parent",
    data: { label: "Orchestrator" },
    position: { x: 1260, y: 140 },
    style: { width: 160, height: 60 },
  },
  {
    id: "ingest",
    type: "default",
    parentId: "group-native-app",
    extent: "parent",
    data: { label: "Ingest" },
    position: { x: 1260, y: 240 },
    style: { width: 140, height: 40 },
  },
  {
    id: "erp",
    type: "default",
    parentId: "group-native-app",
    extent: "parent",
    data: { label: "ERP" },
    position: { x: 1260, y: 300 },
    style: { width: 140, height: 40 },
  },

  // — Nested Group: Engines (inside Native App)
  {
    id: "group-engines",

    parentId: "group-native-app",
    extent: "parent",
    position: { x: 1260, y: 360 },
    style: { width: 300, height: 260 },
    data: { label: "Engines" },
  },
  {
    id: "engine-sql",
    type: "default",
    parentId: "group-engines",
    extent: "parent",
    data: { label: "SQL" },
    position: { x: 1280, y: 400 },
    style: { width: 140, height: 40 },
  },
  {
    id: "engine-logic",
    type: "default",
    parentId: "group-engines",
    extent: "parent",
    data: { label: "Logic" },
    position: { x: 1280, y: 460 },
    style: { width: 140, height: 40 },
  },
  {
    id: "engine-ml",
    type: "default",
    parentId: "group-engines",
    extent: "parent",
    data: { label: "ML" },
    position: { x: 1280, y: 520 },
    style: { width: 140, height: 40 },
  },
  {
    id: "engine-mathopt",
    type: "default",
    parentId: "group-engines",
    extent: "parent",
    data: { label: "MathOpt" },
    position: { x: 1280, y: 580 },
    style: { width: 140, height: 40 },
  },
];

export const edges: Edge[] = [
  // — Libraries → Query Builder
  {
    id: "e-libs-qb",
    source: "group-libraries",
    target: "query-builder",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },

  // — Define stage
  {
    id: "e-qb-mm",
    source: "query-builder",
    target: "metamodel",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: "e-mod-mm",
    source: "modeler",
    target: "metamodel",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: "e-mm-compiler",
    source: "metamodel",
    target: "compiler",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },

  // — Compile → Backends (group) → Exec
  {
    id: "e-compiler-backends",
    source: "compiler",
    target: "group-backends",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: "e-backends-exec",
    source: "group-backends",
    target: "exec-plan",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },

  // — Exec → Orchestrator
  {
    id: "e-exec-orch",
    source: "exec-plan",
    target: "orchestrator",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },

  // — Orchestrator → Ingest, ERP, Engines
  {
    id: "e-orch-ingest",
    source: "orchestrator",
    target: "ingest",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: "e-orch-erp",
    source: "orchestrator",
    target: "erp",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: "e-orch-engines",
    source: "orchestrator",
    target: "group-engines",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

```
