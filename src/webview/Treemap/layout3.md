# Revised Layout System Goals

1. **Hierarchical Layout:** The system must lay out a tree of `ScopeNode` objects, where nodes can be either "Containers" (with children and a header) or "Leafs" (renderable items, typically with text).
2. **Arbitrary Child Positioning (2D Bin Packing):** Within a container, child nodes (both leaves and sub-containers) should be positioned freely in 2D (arbitrary X,Y coordinates) to achieve tight packing. The system should not be restricted to simple horizontal or vertical slicing/shelves.
3. **Leaf Node Readability:**
   - Leaf nodes should adhere to minimum dimensions (e.g., 20x20px).
   - Leaf nodes should strive for preferred dimensions (e.g., 80x40px) if space allows.
   - Leaf nodes must maintain a good aspect ratio for text readability (e.g., width between 1.0x and 4.0x height) if they go larger than 80x40px. This is a high priority.
4. **Container Sizing & Structure:**
   - Containers must display a header of a fixed height.
   - Containers should dynamically size themselves to tightly encompass their packed children and header.
   - The aspect ratio of container nodes themselves is _not_ a primary concern; their shape is determined by their content and the space allocated by their parent.
5. **Value-Driven Space Influence (Soft Goal):**
   - The `value` property of a `ScopeNode` should influence the amount of space it (or its children) attempts to occupy. Higher value nodes should generally get more area or have their preferred sizes prioritized. This can be achieved by:
     - Sorting items by value before packing.
     - Using value to determine a target area for leaves/containers, which then informs their target dimensions for the packer.
6. **Efficient Space Utilization:** The layout should aim to minimize unused whitespace within containers.
7. **Flexibility and Refinement:** The primary packing is algorithmic. Individual leaf nodes' dimensions and internal structure will be determined by the packing algorithm and heuristics.

## High-Level Implementation Details

The core of the system will be a recursive layout function that processes each container and uses a 2D bin packing algorithm for its children.

## Core Layout Engine (Recursive Function)

`function layoutNode(node: ScopeNode, parentAllocatedSpace: Rect): LayoutResult`

- `node`: The current `ScopeNode` to lay out.
- `parentAllocatedSpace`: The rectangular region `{x, y, w, h}` provided by the parent for this `node`. For the root node, this is the viewport.
- `LayoutResult`: Will contain the final `{x, y, w, h}` for `node` and all its descendants.

**Steps within `layoutNode`:**

1. **Initialize Node Position/Size:**

   - The `node` will be positioned and sized within `parentAllocatedSpace`.

2. **Handle Node Type:**

   - **If `node` is a Leaf:**

     1. Determine leaf dimensions based on `parentAllocatedSpace` and heuristics:
        - Inputs: The space it's allowed to occupy.
        - Rules:
          - Fit within `parentAllocatedSpace` (REQUIRED).
          - Min width/height (REQUIRED).
          - Preferred width/height (Attempt to achieve).
          - Aspect ratio for text (Attempt to achieve).
        - The leaf's `w, h` are determined algorithmically.
     2. The `node`'s `w,h` are now determined.

   - **If `node` is a Container:**
     1. **Header Space:** Reserve space for the header at the top of `parentAllocatedSpace`. The remaining area is `contentPackingArea`.
     2. **Child Container Sizing (Proportional Allocation):**
        - Separate children into `childContainers` and `looseLeafs`.
        - Calculate the total `value` of all `childContainers`.
        - For each `childContainer`:
          - Allocate a portion of `contentPackingArea` to it. The `allocatedW` and `allocatedH` for `childContainer` are determined by its `value` as a proportion of the total `childContainers` value. (e.g., `childContainer.value / totalContainerValue * contentPackingArea.w`). Aspect ratio considerations might be applied here or deferred to the recursive call. These dimensions are now considered "pinned" for this packing phase.
     3. **Child Preparation (Loose Leafs):**
        - For each `looseLeaf` of `node`:
          - Estimate its desired dimensions (`targetW`, `targetH`) using heuristics (e.g., preferred size 80x40, adjusted by `value`).
     4. **Sort Children for Packing:**
        - `childContainers` are typically packed first due to their size. They might be sorted by their pre-allocated area (largest first) or `value`.
        - `looseLeafs` are sorted next (e.g., by decreasing estimated area, decreasing `value`).
     5. **Initialize 2D Bin Packer:**
        - Instantiate a chosen packing algorithm (e.g., Skyline, MaxRects).
        - The packer operates within `contentPackingArea.w` (width is usually fixed for a packing pass) and grows in height, or uses the full `contentPackingArea` if pre-allocated.
     6. **Pack Children Iteratively (Two Phases):**
        - **Phase 1: Pack Child Containers:**
          - For each `childContainer` (with its pre-allocated `allocatedW`, `allocatedH`):
            a. **Find Placement:** Ask the packer to find a position (`placedX`, `placedY` relative to `contentPackingArea`) for `childContainer`. The packer will attempt to fit the pre-allocated size.
            b. **If Placement Found:**
            i. The `allocatedCellForChild` is `{ x: contentPackingArea.x + placedX, y: contentPackingArea.y + placedY, w: allocatedW, h: allocatedH }`.
            ii. **Recursively Call `layoutNode`:**
            `layoutNode(childContainer, allocatedCellForChild)`
            This will lay out the `childContainer`'s internals within its pinned cell.
            iii. **Update Packer:** Inform the packer of the actual space used.
            c. **If Placement Not Found:** This indicates an issue with the pre-allocation strategy or packing density. (Handle this: e.g., report error, try to shrink other containers - complex).
        - **Phase 2: Pack Loose Leaf Nodes:**
          - For each `looseLeaf` (with its `targetW`, `targetH`):
            a. **Find Placement:** Ask the packer to find a position in the remaining free space of `contentPackingArea`. The packer might return a cell `{cellX, cellY, cellW, cellH}`.
            b. **If Placement Found:**
            i. The `allocatedCellForChild` is `{ x: contentPackingArea.x + cellX, y: contentPackingArea.y + cellY, w: cellW, h: cellH }`.
            ii. **Recursively Call `layoutNode`:**
            `layoutNode(looseLeaf, allocatedCellForChild)`
            iii. **Update Packer:** Inform the packer of the actual `w,h` used.
            c. **If Placement Not Found:** (Handle this: try smaller `targetW, targetH`, mark as unlayoutable).
     7. **Determine Container's Final Dimensions:**
        - The container's `x,y` are from `parentAllocatedSpace`.
        - The container's `w` is likely `parentAllocatedSpace.w` (or shrink-wrapped if not root).
        - The container's `h` is determined by the packer's total used height + header height + padding.
        - The container's dimensions are set based on these calculations.

## 2D Bin Packing Algorithm (Interface/Choice)

- Define an interface for packers:

  ```typescript
  interface PackerInputItem {
    id: string;
    targetW: number;
    targetH: number /* other data like value */;
  }
  interface PackerPlacement {
    x: number;
    y: number;
    w: number;
    h: number /* actual rect used by packer for this item */;
  }

  interface IBinPacker {
    constructor(maxWidth: number); // Operates within a fixed width, grows in height
    add(item: PackerInputItem): PackerPlacement | null; // Tries to place an item, returns its pos/size or null
    getPackedHeight(): number; // Total height used by packed items
    // Potentially methods to get free rectangles, etc.
  }
  ```

- Implementations:
  - `SkylinePacker`
  - `MaxRectsPacker`
  - (Initially, a simpler shelf-based packer could be a starting point if full 2D is too complex upfront, but the goal is arbitrary 2D).

## Leaf Sizing Heuristics

- This function/logic is key for ensuring leaves meet their complex sizing and aspect ratio goals within a given rectangle, using algorithmic rules.
- The main `layoutNode` function orchestrates calls to the packer and then applies these heuristics for leaf sizing.

## Data Flow & State

- The recursive `layoutNode` calls build up the layout. The results are stored as properties on the nodes or in a separate layout data structure.

## Key Heuristics & Decisions

1. **Child Sorting Order for Packer:** Critical for packing quality. Experimentation needed.
2. **`targetW, targetH` Estimation for Packer:** How to derive good initial dimensions for items before they are handed to the packer, especially considering their `value` and aspect ratio desires.
3. **Choice of Packing Algorithm:** Different algorithms have different trade-offs in terms of packing density, speed, and implementation complexity.
4. **Handling Packer Failure (No Space):** Strategy for when an item cannot be placed.

**High-Level Workflow Summary:**

1. Start `layoutNode` with the root `ScopeNode` and viewport dimensions.
2. If a node is a container:
   a. Separate children into sub-containers and loose leaves.
   b. **Allocate/Pin Sizes for Child Containers:** Determine the dimensions for each child container based on its `value` relative to the total value of all child containers and the available space.
   c. **Estimate Sizes for Loose Leaf Children.**
   d. **Sort Child Containers, then Loose Leafs.**
   e. Use a 2D bin packer:
   i. First, find positions for the pre-sized child containers.
   ii. Then, pack the loose leaf children into the remaining spaces.
   f. For each child and its allocated cell/position, recursively call `layoutNode`.
   g. The packer determines the container's content height (or it's known from pre-allocation if all children are containers).
3. If a node is a leaf:
   a. Use heuristics to determine its optimal `w,h` (respecting aspect ratio, min/pref sizes) within the cell allocated by its parent's packer.
4. Final `x,y,w,h` values are determined and stored.

This refined plan emphasizes the algorithmic nature of the packing and leaf sizing.

## Detailed Plan
