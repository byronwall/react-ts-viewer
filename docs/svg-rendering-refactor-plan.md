# SVG Rendering Logic Analysis and Refactoring Plan

## Current Recursive Rendering System

### How the Current System Works

The current SVG rendering in `TreemapSVG.tsx` uses a recursive approach through the `renderGroup` function:

1. **Entry Point**: `renderGroup(layoutRoot as AnyLayoutNode, depth = 0)`

2. **Recursive Structure**: For each layout node:

   - Creates a `<g>` element with `key={ln.node.id}`
   - Applies transform for positioning: `transform={translate(${ln.x} ${ln.y})}`
   - Renders node-specific content based on type
   - Recursively calls `renderGroup` for all children with `depth + 1`

3. **Node Type Handling**:

   - **Skip Rendering**: Nodes with `w < 2`, `h < 2`, or `renderMode === "none"`
   - **Box Mode**: Simple rect with basic styling for collapsed containers
   - **Text Mode**: Full rendering with headers for containers, content for leaves

4. **Container Rendering** (when `isActuallyContainer` is true):

   - Background rect at `(ln.x, ln.y + headerHeightToUse)`
   - Header content using `finalRenderHeader` with relative transform
   - Children rendered recursively with their own coordinates

5. **Leaf Rendering** (when `isActuallyContainer` is false):
   - Single node content using `finalRenderNode` with relative transform

### Current Transform Hierarchy

```
<g key={parent.id}>                           // Parent container
  <rect x={ln.x} y={ln.y} ... />             // Background
  <g transform="translate(ln.x, ln.y)">       // Header with relative transform
    {finalRenderHeader(...)}
  </g>
  <g key={child1.id}>                        // Child 1 (nested g)
    <g transform="translate(child.x, child.y)"> // Child content with relative transform
      {finalRenderNode(...)}
    </g>
  </g>
  <g key={child2.id}>                        // Child 2 (nested g)
    // ... more nesting
  </g>
</g>
```

### Issues with Current System

1. **Nested Transforms**: Complex hierarchy of relative positioning
2. **Inconsistent Coordinate Systems**: Mix of absolute and relative coordinates
3. **Complex Debugging**: Hard to trace exact positions due to transform nesting
4. **Performance**: Multiple transform calculations for deeply nested structures

## Proposed Flat Rendering System

### Target Architecture

```
<svg>
  <!-- All containers rendered first (bottom layer) -->
  <g key={container1.id} transform="translate(absX, absY)">
    <rect ... />                    // Background
    <rect ... />                    // Header background
    <text ... />                    // Header text
  </g>

  <!-- All leaves rendered second (top layer) -->
  <g key={leaf1.id} transform="translate(absX, absY)">
    <rect ... />                    // Node background
    <text ... />                    // Node text
  </g>
  <g key={leaf2.id} transform="translate(absX, absY)">
    <rect ... />                    // Node background
    <text ... />                    // Node text
  </g>
</svg>
```

### Implementation Plan

The nodes are generated in a nested fashion. Use that info to ensure that the "root" elements are rendered first, and then the children are rendered in the correct order. This will ensure the correct layering of the elements.

#### Phase 1: Data Collection and Flattening

1. **Create `collectAllNodes` function**:

   - Traverse the layout tree recursively
   - Collect all nodes into flat arrays: `containers[]` and `leaves[]`
   - Calculate absolute positions for each node
   - Store all rendering metadata (colors, text, indicators, etc.)

2. **Node Classification**:

   ```typescript
   interface FlatContainerNode {
     id: string;
     node: ScopeNode;
     x: number; // Absolute position
     y: number; // Absolute position
     w: number;
     h: number;
     headerHeight: number;
     depth: number;
     // ... styling properties
   }

   interface FlatLeafNode {
     id: string;
     node: ScopeNode;
     x: number; // Absolute position
     y: number; // Absolute position
     w: number;
     h: number;
     depth: number;
     // ... styling properties
   }
   ```

#### Phase 2: Rendering Functions

1. **Create `renderContainer` function**:

   - Takes `FlatContainerNode` as input
   - Returns JSX for: background rect + header rect + header text
   - All positioning uses absolute coordinates with single transform

2. **Create `renderLeaf` function**:

   - Takes `FlatLeafNode` as input
   - Returns JSX for: node rect + node text + indicators
   - All positioning uses absolute coordinates with single transform

3. **Update main render logic**:

   ```typescript
   return (
     <svg width={width} height={height}>
       {/* Render all containers first (background layer) */}
       {containers.map(container => renderContainer(container))}

       {/* Render all leaves second (foreground layer) */}
       {leaves.map(leaf => renderLeaf(leaf))}

       {/* Debug elements last */}
       {settings.showDebugFreeRectangles && renderFreeRectangles(...)}
     </svg>
   );
   ```

#### Phase 3: Styling and Interaction Migration

1. **Move styling logic**: Extract all color, border, opacity calculations into the data collection phase
2. **Preserve interaction handlers**: Ensure `onNodeClick`, `onMouseEnter`, `onMouseLeave` work with flat structure
3. **Maintain indicators**: Unrendered children and hidden children indicators
4. **Preserve selection/search highlighting**: Border and opacity changes

#### Phase 4: Optimization and Cleanup

1. **Remove recursive `renderGroup` function**
2. **Simplify transform calculations**
3. **Add performance optimizations**:
   - Optimize re-renders with React.memo where appropriate

### Key Considerations

1. **Z-Index Management**: Ensure proper layering (containers behind leaves)
2. **Event Handling**: Maintain all current interaction behaviors
3. **Accessibility**: Preserve any accessibility features
4. **Memory Usage**: Monitor memory impact of flattened node arrays
5. **React Keys**: Ensure stable keys for efficient re-rendering

## Next Steps

1. Implement `collectAllNodes` function to traverse layout tree
2. Create data structures for `FlatContainerNode` and `FlatLeafNode`
3. Build `renderContainer` and `renderLeaf` functions
4. Add feature flag to enable testing of flat rendering
5. Test with existing treemap configurations to ensure visual parity
