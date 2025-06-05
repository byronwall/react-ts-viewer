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

## As Implemented

### Why Children are Smaller Than Their Parent (Single Child Scenario)

This is a key aspect of how the current layout logic works and is influenced by several factors:

#### 1. Parent's Padding

Container nodes have an `options.padding` value. This padding is applied on the inside, reducing the actual `contentPackingArea` available for children.

**Example:**

```
CONTAINER FINAL: <div> [20-22]
- optionsPadding: 1
- finalW: ~338-349 (depending on the pass)
- Available width for children: parentAllocatedSpace.w - 2 * options.padding
```

#### 2. Parent's Header

Container nodes also have a `headerActualHeight`. This header takes up space at the top of the container, further reducing the height of the `contentPackingArea` for children.

**Example:**

```
CONTAINER FINAL: <div> [20-22]
- headerActualHeight: 50
```

#### 3. Child Sizing Rules

**Leaf Children (like `<TaskList>`):**

- Leaf nodes are primarily sized based on `options.leafPrefWidth` and `options.leafPrefHeight`
- They respect `options.leafMinWidth` and `options.leafMinHeight`
- They are **not** designed to automatically expand to fill the parent's `contentPackingArea`

**Example:**

```
<TaskList> (child of <div> [20-22]):
- Gets finalW: 80 (preferred width)
- Parent <div> [20-22] has contentPackingArea.w: 338.29 - 2*1 = 336.29
- The leaf <TaskList> stays at its preferred 80px width
- Result: Blue box is much narrower than yellow box's content area
```

**Container Children (like `<div> [20-22]` as child of `return (...)`):**

- When a container has a single child container, that child's target size is estimated based on taking 100% of the parent's `contentPackingArea`'s area
- Initially aims for a square-like shape (`idealDimension`)
- `childTargetW` and `childTargetH` are capped by the parent's `contentPackingArea.w` and `contentPackingArea.h`
- The packer then places this child
- The child container will typically use its full allocated width

**Example:**

```
return (...) is parent, <div> [20-22] is child:

return (...) CONTAINER FINAL:
- parentAllocatedW: 352.5
- optionsPadding: 3
- headerActualHeight: 75
- contentPackingArea.w: 352.5 - 2*3 = 346.5
- contentPackingArea.h: 352.5 - 75 - 2*3 = 271.5

Child <div> [20-22]:
- childAllocatedW: 338.29 (from CHILD...LAID OUT log)
- This is smaller than 346.5 due to aspect ratio/area calculations
```

#### Summary: Why Children Are Smaller

1. **Parent's usable content space** is reduced by its own padding and header
2. **Leaf children** stick to their preferred sizes rather than expanding to fill available space
3. **Container children** are sized based on area/aspect-ratio heuristics within the parent's content space, not necessarily stretching to fill all dimensions if their calculated ideal size is smaller

#### Height Calculation Issue

There's a discrepancy in the logs regarding the `finalH` of `<div> [20-22]`:

**Expected Calculation:**

```javascript
const containerHeight = Math.min(
  parentAllocatedSpace.h,
  headerActualHeight +
    packedContentHeight +
    (packedContentHeight > 0 ? options.padding * 2 : options.padding)
);

// For <div> [20-22]:
// min(326.5, 50 + 24 + 2*1) = min(326.5, 76) = 76
```

**Logged vs Expected:**

- Log shows: `finalH: 50`
- Expected: `finalH: 76` (to accommodate header + content + padding)

The visual rendering suggests the container does have sufficient height, indicating this may be a logging artifact related to when `currentLayoutNode.h` is captured.

Based on the hierarchical layout code, here's a detailed summary of the layout modes and strategies used:

## Layout Modes Overview

The hierarchical layout system uses different rendering modes and layout strategies depending on the node type and available space:

### **Render Modes**

- **`"text"`** - Default mode for most nodes
- **`"box"`** - Used for containers that are too small to display children
- **`"none"`** - For nodes that shouldn't be rendered (though this isn't actively used in the current code)

## **Container vs Leaf Handling**

### **Container Nodes** (nodes with children)

Containers reserve space for:

- **Header area**: `headerHeight` pixels at the top
- **Content packing area**: Remaining space minus padding for child layout
- **Padding**: Applied around content area (`2 * padding` for left/right, top/bottom)

### **Leaf Nodes** (nodes without children)

Leaves use preferred dimensions with aspect ratio constraints:

- Target preferred width/height (`leafPrefWidth`, `leafPrefHeight`)
- Minimum dimensions (`leafMinWidth`, `leafMinHeight`)
- Aspect ratio bounds (`leafMinAspectRatio`, `leafMaxAspectRatio`)

## **Grid-Based Layout Strategy**

The system switches to **grid-based layout** for leaf nodes when there are **more than 6 children**:

```typescript
if (childrenToLayout.length > 6) {
  // Grid-based approach for many items
  const itemsPerRow = Math.min(
    4,
    Math.ceil(Math.sqrt(childrenToLayout.length))
  );
  const itemsPerCol = Math.ceil(childrenToLayout.length / itemsPerRow);

  childTargetW = Math.max(
    options.leafPrefWidth,
    (contentPackingArea.w / itemsPerRow) * 0.9 // Use 90% of grid cell
  );
  childTargetH = Math.max(
    options.leafPrefHeight,
    (contentPackingArea.h / itemsPerCol) * 0.9
  );
}
```

**Grid Logic:**

- Maximum 4 items per row
- Uses square root to determine initial grid dimensions
- Each cell uses 90% of allocated grid space (10% for implicit spacing)
- Prevents creation of many narrow, unusable columns

## **2D Bin Packing System**

The layout uses a sophisticated **Guillotine-based 2D bin packer** for optimal space utilization:

### **Core Algorithm**

1. **Initialize** with one large free rectangle covering the entire content area
2. **Find best fit** using heuristics (Best Short Side Fit by default)
3. **Place item** and split the used rectangle
4. **Update free rectangles** and remove overlapping ones

### **Packing Heuristics**

The system supports multiple fit strategies:

- **BestShortSideFit** (default) - Minimizes wasted space on shorter side
- **BestAreaFit** - Minimizes total wasted area
- **BestLongSideFit** - Optimizes for longer dimension fit

### **Rectangle Splitting Strategy**

When an item is placed, the used rectangle is split intelligently:

```typescript
// Create right rectangle (vertical split)
if (rightWidth >= minUsefulWidth) {
  // Add right rectangle using full remaining height
}

// Create bottom rectangle (horizontal split)
if (bottomHeight >= minUsefulHeight) {
  // Add bottom rectangle, extend width if right area too narrow
}
```

**Key Features:**

- **Minimum useful dimensions** (20px width, 12px height) prevent creation of unusable slivers
- **Smart width extension** - bottom rectangles extend full width if right area is too narrow
- **Overlap removal** - Automatically removes rectangles contained within others

## **Space Utilization Optimization**

### **Low Utilization Detection**

The system analyzes space efficiency and adapts:

```typescript
const utilizationRatio = totalTargetArea / availableArea;

if (utilizationRatio < 0.8 && sortedPackerItems.length > 2) {
  // Expand widths for better space usage
  const expansionFactor = Math.min(3.0, Math.sqrt(1 / utilizationRatio));
}
```

**Optimization Strategies:**

- **Width expansion** for utilization < 80%
- **Aggressive expansion** for utilization < 60%
- **Small item targeting** - preferentially expand items below average size
- **Aspect ratio preservation** - maintain reasonable width/height ratios

### **Dynamic Container Resizing**

When containers use less space than allocated, the system reclaims unused space:

1. **Detect unused space** - Compare allocated vs actual container dimensions
2. **Create free rectangles** - Convert unused areas back to available space
3. **Update packer state** - Add new free rectangles for subsequent siblings

## **Adaptive Placement Fallback**

When normal packing fails, the system attempts **adaptive placement**:

1. **Analyze free rectangles** - Find best available space
2. **Aggressive expansion** - Use up to 98% of available width, respect 6:1 max aspect ratio
3. **Score-based selection** - Choose rectangle with best area × utilization score
4. **Manual rectangle splitting** - Update packer state after placement

## **Layout Decision Flow**

The system follows this decision hierarchy:

1. **Space check** - Skip if insufficient space for minimum dimensions
2. **Container vs leaf** determination
3. **Small container handling** - Render as box if below minimum thresholds
4. **Grid vs standard** sizing based on child count
5. **2D bin packing** with sorted items (largest area first)
6. **Space utilization optimization** and width expansion
7. **Adaptive placement** for failed standard placements
8. **Dynamic resizing** and space reclamation

This multi-layered approach ensures optimal space utilization while maintaining visual hierarchy and readability across different content densities and viewport sizes.
