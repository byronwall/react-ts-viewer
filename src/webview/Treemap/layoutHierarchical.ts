import { ScopeNode } from "../../types";

// Base structure for all layout nodes, similar to other layouts
export interface BaseLayoutNode {
  node: ScopeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  children?: HierarchicalLayoutNode[];
  parent?: HierarchicalLayoutNode;
  isContainer?: boolean; // True if it's a container with a header and children area
  renderMode?: "text" | "box" | "none"; // How the node should be rendered
  depth: number;
}

export interface HierarchicalLayoutNode extends BaseLayoutNode {
  // Add any specific properties for hierarchical layout nodes if needed
}

export interface HierarchicalLayoutOptions {
  headerHeight: number;
  padding: number; // General padding for within containers
  leafMinWidth: number;
  leafMinHeight: number;
  leafPrefWidth: number;
  leafPrefHeight: number;
  leafMinAspectRatio: number;
  leafMaxAspectRatio: number;
  // Packer choice could be an option later
  // valueAccessor: (node: ScopeNode) => number; // To get the 'value' for sizing
}

// --- 2D Bin Packer (Guillotine-based Implementation) ---
interface PackerInputItem {
  id: string;
  targetW: number;
  targetH: number;
  node: ScopeNode; // Keep original node for value access or other properties
}

interface PackerPlacement {
  id: string;
  x: number;
  y: number;
  w: number; // Actual width allocated
  h: number; // Actual height allocated
  fits: boolean;
}

interface FreeRectangle {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface I2DBinPacker {
  add(item: PackerInputItem): PackerPlacement;
  getPackedHeight(): number;
  getPackedWidth(): number;
  reset(): void;
}

enum FitHeuristic {
  BestAreaFit,
  BestShortSideFit,
  BestLongSideFit,
  WorstAreaFit,
  WorstShortSideFit,
  WorstLongSideFit,
}

class Guillotine2DPacker implements I2DBinPacker {
  private freeRectangles: FreeRectangle[] = [];
  private packedItems: PackerPlacement[] = [];
  private interItemPadding: number;
  private maxWidth: number;
  private maxHeight: number;
  private usedWidth: number = 0;
  private usedHeight: number = 0;

  constructor(
    maxWidth: number,
    maxHeight: number = Number.MAX_SAFE_INTEGER,
    optionsPadding: number = 0
  ) {
    this.maxWidth = maxWidth;
    this.maxHeight = maxHeight;
    this.interItemPadding = Math.max(0, Math.floor(optionsPadding / 2));

    // Initialize with one large free rectangle
    this.freeRectangles.push({
      x: 0,
      y: 0,
      w: maxWidth,
      h: maxHeight,
    });
  }

  add(item: PackerInputItem): PackerPlacement {
    // Find best rectangle using heuristic
    const bestRect = this.findBestRectangle(
      item.targetW,
      item.targetH,
      FitHeuristic.BestShortSideFit // Changed from BestAreaFit for better packing
    );

    if (!bestRect) {
      // No suitable rectangle found - return failure
      return {
        id: item.id,
        x: 0,
        y: 0,
        w: item.targetW,
        h: item.targetH,
        fits: false,
      };
    }

    return this.placeItem(item, bestRect);
  }

  private placeItem(
    item: PackerInputItem,
    rect: FreeRectangle
  ): PackerPlacement {
    // Calculate actual position with padding
    const actualX =
      rect.x + (this.packedItems.length > 0 ? this.interItemPadding : 0);
    const actualY =
      rect.y + (this.packedItems.length > 0 ? this.interItemPadding : 0);

    // Calculate space needed including padding
    const spaceW =
      item.targetW + (this.packedItems.length > 0 ? this.interItemPadding : 0);
    const spaceH =
      item.targetH + (this.packedItems.length > 0 ? this.interItemPadding : 0);

    const placement: PackerPlacement = {
      id: item.id,
      x: actualX,
      y: actualY,
      w: item.targetW,
      h: item.targetH,
      fits: true,
    };

    // Split the rectangle and update free rectangles
    this.splitRectangle(rect, spaceW, spaceH);

    // Update usage tracking
    this.usedWidth = Math.max(this.usedWidth, actualX + item.targetW);
    this.usedHeight = Math.max(this.usedHeight, actualY + item.targetH);

    this.packedItems.push(placement);
    return placement;
  }

  private findBestRectangle(
    width: number,
    height: number,
    heuristic: FitHeuristic
  ): FreeRectangle | null {
    let bestRect: FreeRectangle | null = null;
    let bestScore = Number.MAX_SAFE_INTEGER;
    let bestSecondaryScore = Number.MAX_SAFE_INTEGER;

    // Calculate space needed including padding
    const needW =
      width + (this.packedItems.length > 0 ? this.interItemPadding : 0);
    const needH =
      height + (this.packedItems.length > 0 ? this.interItemPadding : 0);

    for (const rect of this.freeRectangles) {
      if (rect.w >= needW && rect.h >= needH) {
        let score: number;
        let secondaryScore: number;

        switch (heuristic) {
          case FitHeuristic.BestAreaFit:
            score = rect.w * rect.h - needW * needH;
            secondaryScore = Math.min(rect.w - needW, rect.h - needH);
            break;

          case FitHeuristic.BestShortSideFit:
            score = Math.min(rect.w - needW, rect.h - needH);
            secondaryScore = Math.max(rect.w - needW, rect.h - needH);
            break;

          case FitHeuristic.BestLongSideFit:
            score = Math.max(rect.w - needW, rect.h - needH);
            secondaryScore = Math.min(rect.w - needW, rect.h - needH);
            break;

          default:
            score = rect.w * rect.h - needW * needH;
            secondaryScore = Math.min(rect.w - needW, rect.h - needH);
        }

        if (
          score < bestScore ||
          (score === bestScore && secondaryScore < bestSecondaryScore)
        ) {
          bestRect = rect;
          bestScore = score;
          bestSecondaryScore = secondaryScore;
        }
      }
    }

    return bestRect;
  }

  private splitRectangle(
    rect: FreeRectangle,
    width: number,
    height: number
  ): void {
    // Remove the used rectangle
    const index = this.freeRectangles.indexOf(rect);
    if (index !== -1) {
      this.freeRectangles.splice(index, 1);
    }

    // Create new free rectangles from the remaining space
    const rightWidth = rect.w - width;
    const bottomHeight = rect.h - height;

    // Improved splitting strategy to avoid creating too many narrow, unusable rectangles
    const minUsefulWidth = 20; // Minimum width that could be useful
    const minUsefulHeight = 12; // Minimum height that could be useful

    // Right rectangle (vertical split)
    if (rightWidth >= minUsefulWidth) {
      // For the right rectangle, use the full remaining height if it's useful
      const rightHeight = rect.h;
      if (rightHeight >= minUsefulHeight) {
        this.freeRectangles.push({
          x: rect.x + width,
          y: rect.y,
          w: rightWidth,
          h: rightHeight,
        });
      }
    }

    // Bottom rectangle (horizontal split)
    if (bottomHeight >= minUsefulHeight) {
      // For the bottom rectangle, only use the width of the placed item if the right area is too narrow
      let bottomWidth = width;

      // If we didn't create a right rectangle (because it was too narrow),
      // extend the bottom rectangle to use the full width
      if (rightWidth < minUsefulWidth) {
        bottomWidth = rect.w;
      }

      if (bottomWidth >= minUsefulWidth) {
        this.freeRectangles.push({
          x: rect.x,
          y: rect.y + height,
          w: bottomWidth,
          h: bottomHeight,
        });
      }
    }

    // Clean up overlapping rectangles
    this.removeOverlappingRectangles();
  }

  private removeOverlappingRectangles(): void {
    // Remove rectangles that are completely contained within others
    for (let i = 0; i < this.freeRectangles.length; i++) {
      const rectI = this.freeRectangles[i];
      if (!rectI) continue;

      for (let j = i + 1; j < this.freeRectangles.length; j++) {
        const rectJ = this.freeRectangles[j];
        if (!rectJ) continue;

        if (this.isRectangleContained(rectI, rectJ)) {
          this.freeRectangles.splice(i, 1);
          i--;
          break;
        } else if (this.isRectangleContained(rectJ, rectI)) {
          this.freeRectangles.splice(j, 1);
          j--;
        }
      }
    }
  }

  private isRectangleContained(
    rect: FreeRectangle,
    container: FreeRectangle
  ): boolean {
    return (
      rect.x >= container.x &&
      rect.y >= container.y &&
      rect.x + rect.w <= container.x + container.w &&
      rect.y + rect.h <= container.y + container.h
    );
  }

  getPackedHeight(): number {
    return this.usedHeight;
  }

  getPackedWidth(): number {
    return this.usedWidth;
  }

  reset(): void {
    this.freeRectangles = [
      {
        x: 0,
        y: 0,
        w: this.maxWidth,
        h: this.maxHeight,
      },
    ];
    this.packedItems = [];
    this.usedWidth = 0;
    this.usedHeight = 0;
  }

  // Debug method to visualize free rectangles
  logPackingVisualization(containerLabel: string): void {
    console.log(`\n--- 2D PACKING VISUALIZATION for ${containerLabel} ---`);
    console.log(
      `Container: ${this.maxWidth} x ${this.maxHeight}, Used: ${this.usedWidth} x ${this.usedHeight}`
    );

    console.log("\nPacked items:");
    this.packedItems.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.id} @ (${p.x}, ${p.y}) ${p.w} x ${p.h}`);
    });

    console.log("\nFree rectangles:");
    this.freeRectangles.forEach((r, i) => {
      console.log(`  F${i + 1}. @ (${r.x}, ${r.y}) ${r.w} x ${r.h}`);
    });

    console.log("--- END 2D PACKING VISUALIZATION ---\n");
  }

  // Public method to add free rectangles for dynamic resizing
  addFreeRectangle(rect: FreeRectangle): void {
    this.freeRectangles.push(rect);
    this.removeOverlappingRectangles();
  }

  // Public method to clean up overlapping rectangles
  cleanupOverlappingRectangles(): void {
    this.removeOverlappingRectangles();
  }
}

// Helper function to sort items for better packing
function sortItemsForPacking(
  items: PackerInputItem[],
  strategy: "area" | "width" | "height" | "perimeter" = "area"
): PackerInputItem[] {
  return [...items].sort((a, b) => {
    switch (strategy) {
      case "area":
        return b.targetW * b.targetH - a.targetW * a.targetH;
      case "width":
        return b.targetW - a.targetW;
      case "height":
        return b.targetH - a.targetH;
      case "perimeter":
        return 2 * (b.targetW + b.targetH) - 2 * (a.targetW + a.targetH);
      default:
        return b.targetW * b.targetH - a.targetW * a.targetH;
    }
  });
}

// Legacy interface for compatibility
interface ISimpleShelfPacker {
  add(item: PackerInputItem): PackerPlacement;
  getPackedHeight(): number;
  reset(): void;
}

// Wrapper class to maintain interface compatibility
class SimpleShelfPacker implements ISimpleShelfPacker {
  private packer: Guillotine2DPacker;

  constructor(maxWidth: number, maxHeight: number, optionsPadding: number) {
    this.packer = new Guillotine2DPacker(maxWidth, maxHeight, optionsPadding);
  }

  add(item: PackerInputItem): PackerPlacement {
    return this.packer.add(item);
  }

  getPackedHeight(): number {
    return this.packer.getPackedHeight();
  }

  reset(): void {
    this.packer.reset();
  }

  // Debug method to access the underlying packer's visualization
  logPackingVisualization(containerLabel: string): void {
    this.packer.logPackingVisualization(containerLabel);
  }

  // Method to add free rectangles for dynamic resizing
  addFreeRectangle(rect: FreeRectangle): void {
    this.packer.addFreeRectangle(rect);
  }

  // Method to clean up overlapping rectangles
  cleanupOverlappingRectangles(): void {
    this.packer.cleanupOverlappingRectangles();
  }
}

// --- Main Layout Function ---
export type HierarchicalLayoutFn = (
  rootNode: ScopeNode,
  viewportWidth: number,
  viewportHeight: number,
  options: HierarchicalLayoutOptions
) => HierarchicalLayoutNode;

export const layoutHierarchical: HierarchicalLayoutFn = (
  rootNode,
  viewportWidth,
  viewportHeight,
  options
) => {
  console.warn("***** laying out");

  const layoutRoot = layoutNodeRecursive(
    rootNode,
    { x: 0, y: 0, w: viewportWidth, h: viewportHeight },
    options,
    0, // depth
    undefined // parent
  );

  // Count total nodes in input tree vs rendered nodes in output tree
  const countTotalNodes = (
    node: ScopeNode
  ): { total: number; containers: number; leaves: number } => {
    if (!node) return { total: 0, containers: 0, leaves: 0 };

    const isContainer = !!(node.children && node.children.length > 0);
    const result = {
      total: 1,
      containers: isContainer ? 1 : 0,
      leaves: isContainer ? 0 : 1,
    };

    if (node.children) {
      for (const child of node.children) {
        const childCounts = countTotalNodes(child);
        result.total += childCounts.total;
        result.containers += childCounts.containers;
        result.leaves += childCounts.leaves;
      }
    }
    return result;
  };

  const countRenderedNodes = (
    layoutNode: HierarchicalLayoutNode | null
  ): { total: number; containers: number; leaves: number } => {
    if (!layoutNode) return { total: 0, containers: 0, leaves: 0 };

    const isContainer = layoutNode.isContainer;
    const result = {
      total: 1,
      containers: isContainer ? 1 : 0,
      leaves: isContainer ? 0 : 1,
    };

    if (layoutNode.children) {
      for (const child of layoutNode.children) {
        const childCounts = countRenderedNodes(child);
        result.total += childCounts.total;
        result.containers += childCounts.containers;
        result.leaves += childCounts.leaves;
      }
    }
    return result;
  };

  const totalInputCounts = countTotalNodes(rootNode);
  const totalRenderedCounts = countRenderedNodes(layoutRoot);
  const unrenderedTotal = totalInputCounts.total - totalRenderedCounts.total;
  const unrenderedContainers =
    totalInputCounts.containers - totalRenderedCounts.containers;
  const unrenderedLeaves = totalInputCounts.leaves - totalRenderedCounts.leaves;
  const renderPercentage = (
    (totalRenderedCounts.total / totalInputCounts.total) *
    100
  ).toFixed(1);

  console.log(`\n🎯 === LAYOUT COMPLETION SUMMARY ===`, {
    totalNodes: {
      input: totalInputCounts.total,
      rendered: totalRenderedCounts.total,
      unrendered: unrenderedTotal,
      percentage: `${renderPercentage}%`,
    },
    containers: {
      input: totalInputCounts.containers,
      rendered: totalRenderedCounts.containers,
      unrendered: unrenderedContainers,
      percentage:
        totalInputCounts.containers > 0
          ? `${((totalRenderedCounts.containers / totalInputCounts.containers) * 100).toFixed(1)}%`
          : "N/A",
    },
    leaves: {
      input: totalInputCounts.leaves,
      rendered: totalRenderedCounts.leaves,
      unrendered: unrenderedLeaves,
      percentage:
        totalInputCounts.leaves > 0
          ? `${((totalRenderedCounts.leaves / totalInputCounts.leaves) * 100).toFixed(1)}%`
          : "N/A",
    },
    viewportDimensions: `${viewportWidth} x ${viewportHeight}`,
    layoutOptions: {
      padding: options.padding,
      headerHeight: options.headerHeight,
      leafMinSize: `${options.leafMinWidth} x ${options.leafMinHeight}`,
      leafPrefSize: `${options.leafPrefWidth} x ${options.leafPrefHeight}`,
    },
  });

  if (unrenderedTotal > 0) {
    console.warn(
      `⚠️  ${unrenderedTotal} nodes (${(100 - parseFloat(renderPercentage)).toFixed(1)}%) were not rendered due to space constraints`,
      {
        breakdown: `${unrenderedContainers} containers, ${unrenderedLeaves} leaves`,
      }
    );
  } else {
    console.log(`✅ All nodes successfully rendered!`);
  }

  // Fallback if layoutRoot is null (should not happen for the root)
  return (
    layoutRoot || {
      node: rootNode,
      x: 0,
      y: 0,
      w: viewportWidth,
      h: viewportHeight,
      depth: 0,
      isContainer: !!(rootNode.children && rootNode.children.length > 0),
      renderMode: "text",
    }
  );
};

// --- Recursive Layout Engine ---
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutNodeRecursive(
  node: ScopeNode,
  parentAllocatedSpace: Rect,
  options: HierarchicalLayoutOptions,
  depth: number,
  parentLayoutNode?: HierarchicalLayoutNode
): HierarchicalLayoutNode | null {
  if (parentAllocatedSpace.w <= 0 || parentAllocatedSpace.h <= 0) {
    console.log(
      `[layoutNodeRecursive] SKIPPED (insufficient space): ${node.label} (ID: ${node.id})`,
      {
        neededMinW: options.leafMinWidth,
        neededMinH: options.leafMinHeight,
        availableW: parentAllocatedSpace.w,
        availableH: parentAllocatedSpace.h,
        reason: "parentAllocatedSpace too small",
      }
    );
    return null;
  }
  if (
    isNaN(parentAllocatedSpace.w) ||
    isNaN(parentAllocatedSpace.h) ||
    isNaN(parentAllocatedSpace.x) ||
    isNaN(parentAllocatedSpace.y)
  ) {
    // This indicates a severe issue upstream or with initial inputs.
    console.log(
      `[layoutNodeRecursive] SKIPPED (NaN values): ${node.label} (ID: ${node.id})`,
      {
        parentAllocatedSpace,
        reason: "NaN in parentAllocatedSpace",
      }
    );
    return null;
  }

  const isEffectivelyLeaf = !node.children || node.children.length === 0;

  // For containers with very small allocated space, render as simple box instead of skipping
  if (
    !isEffectivelyLeaf &&
    (parentAllocatedSpace.w < options.leafMinWidth ||
      parentAllocatedSpace.h < options.leafMinHeight)
  ) {
    console.log(
      `[layoutNodeRecursive] CONTAINER rendered as SMALL BOX (below minimum): ${node.label} (ID: ${node.id})`,
      {
        allocatedW: parentAllocatedSpace.w,
        allocatedH: parentAllocatedSpace.h,
        minW: options.leafMinWidth,
        minH: options.leafMinHeight,
        reason: "allocated space below minimum - rendering as small box",
      }
    );

    return {
      node,
      x: parentAllocatedSpace.x,
      y: parentAllocatedSpace.y,
      w: parentAllocatedSpace.w,
      h: parentAllocatedSpace.h,
      depth,
      parent: parentLayoutNode,
      children: [],
      isContainer: true,
      renderMode: "box", // Special render mode for small containers
    };
  }

  const calculatedW = parentAllocatedSpace.w;
  const calculatedH = parentAllocatedSpace.h;

  const currentLayoutNode: HierarchicalLayoutNode = {
    node,
    x: parentAllocatedSpace.x,
    y: parentAllocatedSpace.y,
    w: calculatedW,
    h: calculatedH,
    depth,
    parent: parentLayoutNode,
    children: [],
    isContainer: !isEffectivelyLeaf, // Initially assume container if has children
    renderMode: "text",
  };

  if (isEffectivelyLeaf) {
    // --- Handle Leaf Node ---
    // Apply heuristics: min/pref size, aspect ratio. Fit within parentAllocatedSpace.
    let targetW = Math.max(options.leafMinWidth, options.leafPrefWidth);
    let targetH = Math.max(options.leafMinHeight, options.leafPrefHeight);

    // Aspect ratio adjustment (simplified)
    // If too wide for aspect ratio: h = w / maxAspect
    // If too tall for aspect ratio: w = h * maxAspect (or w = h / minAspect if defined that way)
    // This needs more sophisticated logic to balance prefSize and aspectRatio within allocated space.

    // For now, just try to fit preferred, then scale down if needed.
    if (targetW > parentAllocatedSpace.w) {
      const scale = parentAllocatedSpace.w / targetW;
      targetW = parentAllocatedSpace.w;
      targetH *= scale;
    }
    if (targetH > parentAllocatedSpace.h) {
      const scale = parentAllocatedSpace.h / targetH;
      targetH = parentAllocatedSpace.h;
      targetW *= scale; // Maintain aspect ratio from previous adjustment
    }

    currentLayoutNode.w = Math.max(options.leafMinWidth, targetW);
    currentLayoutNode.h = Math.max(options.leafMinHeight, targetH);

    // Ensure it still fits after min enforcement (could clip if min is larger than allocated)
    currentLayoutNode.w = Math.min(currentLayoutNode.w, parentAllocatedSpace.w);
    currentLayoutNode.h = Math.min(currentLayoutNode.h, parentAllocatedSpace.h);

    currentLayoutNode.isContainer = false; // It's a leaf
  } else {
    // --- Handle Container Node ---
    currentLayoutNode.isContainer = true;
    const headerActualHeight = Math.min(
      options.headerHeight,
      parentAllocatedSpace.h
    );

    const contentPackingArea: Rect = {
      x: 0, // Relative to container's own (0,0)
      y: headerActualHeight,
      w: parentAllocatedSpace.w - 2 * options.padding, // Account for L/R padding
      h: parentAllocatedSpace.h - headerActualHeight - 2 * options.padding, // Account for T/B padding (header + bottom)
    };

    if (contentPackingArea.w <= 0 || contentPackingArea.h <= 0) {
      // Not enough space for content, render as box without children

      // Render as a simple box that fits in the allocated space
      currentLayoutNode.w = parentAllocatedSpace.w;
      currentLayoutNode.h = parentAllocatedSpace.h;
      currentLayoutNode.children = [];
      currentLayoutNode.isContainer = true; // Keep as container for styling
      currentLayoutNode.renderMode = "box"; // Special render mode for small containers

      return currentLayoutNode;
    }

    const packer = new SimpleShelfPacker(
      contentPackingArea.w,
      contentPackingArea.h,
      options.padding
    );

    const childrenToLayout = node.children || [];
    // Create packer items first for optimal 2D bin packing
    const packerItems: PackerInputItem[] = [];
    const totalChildrenValue =
      childrenToLayout.reduce((sum, child) => sum + (child.value || 1), 0) || 1;

    // First pass: calculate dimensions for all children
    for (const childNode of childrenToLayout) {
      // Estimate child size
      const isChildContainer =
        childNode.children && childNode.children.length > 0;
      let childTargetW, childTargetH;

      if (isChildContainer) {
        const childValueRatio = (childNode.value || 1) / totalChildrenValue;

        const targetArea =
          contentPackingArea.w * contentPackingArea.h * childValueRatio;
        let idealDimension = Math.sqrt(targetArea);
        if (isNaN(idealDimension) || idealDimension === 0)
          idealDimension = options.leafMinWidth; // Fallback

        // Improved space filling logic for containers
        if (childrenToLayout.length === 1) {
          // Single child case: fill all available space
          childTargetW = contentPackingArea.w;
          childTargetH = contentPackingArea.h;
        } else {
          // Multiple children: start with square, but snap to fill dimension if close
          childTargetW = idealDimension;
          childTargetH = idealDimension;

          // If within 20% of filling width or height, snap to fill that dimension
          const widthFillRatio = idealDimension / contentPackingArea.w;
          const heightFillRatio = idealDimension / contentPackingArea.h;

          if (widthFillRatio >= 0.8) {
            // Close to filling width - snap to full width and adjust height
            childTargetW = contentPackingArea.w;
            childTargetH = Math.min(
              targetArea / childTargetW,
              contentPackingArea.h
            );
          } else if (heightFillRatio >= 0.8) {
            // Close to filling height - snap to full height and adjust width
            childTargetH = contentPackingArea.h;
            childTargetW = Math.min(
              targetArea / childTargetH,
              contentPackingArea.w
            );
          }
          // Additional check: if residual space would be too small, fill the dimension
          const residualWidth = contentPackingArea.w - childTargetW;
          const residualHeight = contentPackingArea.h - childTargetH;

          if (residualWidth > 0 && residualWidth < options.leafMinWidth) {
            // Residual width too small - expand to fill full width
            childTargetW = contentPackingArea.w;
            childTargetH = Math.min(
              targetArea / childTargetW,
              contentPackingArea.h
            );
          } else if (
            residualHeight > 0 &&
            residualHeight < options.leafMinHeight
          ) {
            // Residual height too small - expand to fill full height
            childTargetH = contentPackingArea.h;
            childTargetW = Math.min(
              targetArea / childTargetH,
              contentPackingArea.w
            );
          }
        }

        // Cap by available space
        childTargetW = Math.min(childTargetW, contentPackingArea.w);
        childTargetH = Math.min(childTargetH, contentPackingArea.h);
      } else {
        // Is a Leaf - use grid-based sizing to prevent narrow columns
        if (childrenToLayout.length > 6) {
          // For many items, use grid-based approach
          const itemsPerRow = Math.min(
            4,
            Math.ceil(Math.sqrt(childrenToLayout.length))
          );
          const itemsPerCol = Math.ceil(childrenToLayout.length / itemsPerRow);

          childTargetW = Math.max(
            options.leafPrefWidth,
            (contentPackingArea.w / itemsPerRow) * 0.9 // Use 90% of grid cell width
          );
          childTargetH = Math.max(
            options.leafPrefHeight,
            (contentPackingArea.h / itemsPerCol) * 0.9 // Use 90% of grid cell height
          );
        } else {
          // For fewer items, use standard preferred size but expand width if space allows
          childTargetW = Math.min(
            contentPackingArea.w * 0.6, // Use up to 60% of width for individual items
            Math.max(
              options.leafPrefWidth,
              contentPackingArea.w / Math.min(3, childrenToLayout.length)
            )
          );
          childTargetH = options.leafPrefHeight;
        }
      }

      childTargetW = Math.max(options.leafMinWidth, childTargetW);
      // For containers, ensure targetH can accommodate at least a minimal content area + header
      // For leaves, just ensure min height.
      const minHeightForChild = isChildContainer
        ? options.leafMinHeight + options.headerHeight
        : options.leafMinHeight;
      childTargetH = Math.max(minHeightForChild, childTargetH);

      // Ensure target dimensions for packer do not exceed available packing area dimensions
      childTargetW = Math.min(childTargetW, contentPackingArea.w);
      childTargetH = Math.min(childTargetH, contentPackingArea.h);

      // Add to packer items
      packerItems.push({
        id: childNode.id,
        targetW: childTargetW,
        targetH: childTargetH,
        node: childNode,
      });
    }

    // Sort items for optimal 2D bin packing (largest area first instead of height first)
    const sortedPackerItems = sortItemsForPacking(packerItems, "area");

    // Pre-analysis: Check if we have many small items that could benefit from width expansion
    const totalTargetArea = sortedPackerItems.reduce(
      (sum, item) => sum + item.targetW * item.targetH,
      0
    );
    const availableArea = contentPackingArea.w * contentPackingArea.h;
    const utilizationRatio = totalTargetArea / availableArea;

    console.log(
      `[layoutNodeRecursive] PACKING ANALYSIS: ${node.label} (ID: ${node.id})`,
      {
        totalTargetArea,
        availableArea,
        utilizationRatio,
        childCount: sortedPackerItems.length,
        contentPackingArea,
      }
    );

    // If utilization is low and we have many small items, expand their widths
    if (utilizationRatio < 0.8 && sortedPackerItems.length > 2) {
      console.log(
        `[layoutNodeRecursive] LOW UTILIZATION DETECTED - expanding widths for better space usage`
      );

      // Calculate expansion factor based on available space
      const expansionFactor = Math.min(3.0, Math.sqrt(1 / utilizationRatio));

      for (const item of sortedPackerItems) {
        // Expand width more aggressively for small items
        const currentArea = item.targetW * item.targetH;
        const averageItemArea = availableArea / sortedPackerItems.length;
        const isSmallItem = currentArea < averageItemArea * 0.7;

        if (isSmallItem) {
          const oldWidth = item.targetW;
          const maxExpandedWidth = Math.min(
            contentPackingArea.w * 0.95, // Increase to 95% of width
            item.targetW * expansionFactor * 2.5 // Increase expansion multiplier
          );

          item.targetW = Math.min(maxExpandedWidth, contentPackingArea.w);

          // Slightly reduce height to maintain similar area if we expanded width significantly
          if (item.targetW > oldWidth * 1.2) {
            item.targetH = Math.max(
              options.leafMinHeight,
              (currentArea / item.targetW) * 1.1 // Slight area increase
            );
          }

          console.log(
            `[WIDTH EXPANSION] ${item.node.label}: ${oldWidth.toFixed(1)} -> ${item.targetW.toFixed(1)} (width), height: ${item.targetH.toFixed(1)}`
          );
        }
      }
    }

    // Also apply width expansion when utilization is very low, regardless of item count
    if (utilizationRatio < 0.6) {
      console.log(
        `[layoutNodeRecursive] VERY LOW UTILIZATION - expanding all item widths`
      );

      for (const item of sortedPackerItems) {
        const oldWidth = item.targetW;
        const currentArea = item.targetW * item.targetH;

        // Expand width to use more of the available space
        const targetWidth = Math.min(
          contentPackingArea.w * 0.8, // Increase to 80% of container width
          item.targetW * 2.5 // Increase multiplier from 2.0 to 2.5
        );

        if (targetWidth > item.targetW) {
          item.targetW = targetWidth;

          // Adjust height to maintain reasonable area
          item.targetH = Math.max(
            options.leafMinHeight,
            Math.min(item.targetH, (currentArea / item.targetW) * 1.2)
          );

          console.log(
            `[AGGRESSIVE WIDTH EXPANSION] ${item.node.label}: ${oldWidth.toFixed(1)} -> ${item.targetW.toFixed(1)} (width), height: ${item.targetH.toFixed(1)}`
          );
        }
      }
    }

    // Second pass: pack the sorted items
    console.log(
      `[layoutNodeRecursive] CONTAINER PACKING CHILDREN: ${node.label} (ID: ${node.id})`,
      {
        totalChildren: sortedPackerItems.length,
        childrenToProcess: sortedPackerItems.map((item) => ({
          id: item.id,
          targetW: item.targetW,
          targetH: item.targetH,
          label: item.node.label,
          isContainer: !!(item.node.children && item.node.children.length > 0),
        })),
        contentPackingArea,
        availableFreeRectsAtStart:
          (packer as any).packer?.freeRectangles?.length || 0,
      }
    );

    for (const packerInput of sortedPackerItems) {
      const childNode = packerInput.node;

      console.log(
        `[layoutNodeRecursive] ATTEMPTING TO PACK CHILD: ${childNode.label} (ID: ${childNode.id})`,
        {
          targetW: packerInput.targetW,
          targetH: packerInput.targetH,
          availableFreeRects:
            (packer as any).packer?.freeRectangles?.length || 0,
        }
      );

      const placement = packer.add(packerInput);

      if (placement.fits) {
        // SimpleShelfPacker always sets fits = true
        const allocatedCellForChild: Rect = {
          x: parentAllocatedSpace.x + options.padding + placement.x, // Convert to absolute
          y:
            parentAllocatedSpace.y +
            headerActualHeight +
            options.padding +
            placement.y, // Convert to absolute
          w: placement.w,
          h: placement.h,
        };

        // Ensure child allocation does not exceed the content packing area boundaries
        // placement.x and placement.y are relative to contentPackingArea's origin (top-left of the area where children are packed).
        // contentPackingArea.w and contentPackingArea.h are the dimensions of this packing area.
        const childMaxW = contentPackingArea.w - placement.x;
        const childMaxH = contentPackingArea.h - placement.y;

        allocatedCellForChild.w = Math.min(allocatedCellForChild.w, childMaxW);
        allocatedCellForChild.h = Math.min(allocatedCellForChild.h, childMaxH);

        // Ensure dimensions are positive before recursing
        if (allocatedCellForChild.w > 0 && allocatedCellForChild.h > 0) {
          const laidOutChild = layoutNodeRecursive(
            childNode,
            allocatedCellForChild,
            options,
            depth + 1,
            currentLayoutNode
          );
          if (laidOutChild) {
            currentLayoutNode.children?.push(laidOutChild);

            // Dynamic Container Resizing: If this is a container child that used less space than allocated,
            // reclaim the unused space for subsequent siblings
            if (
              laidOutChild.isContainer &&
              (laidOutChild.h < placement.h || laidOutChild.w < placement.w)
            ) {
              const heightDifference = placement.h - laidOutChild.h;
              const widthDifference = placement.w - laidOutChild.w;

              console.log(
                `[DYNAMIC RESIZE] Container ${childNode.label} used less space than allocated`,
                {
                  allocatedW: placement.w,
                  allocatedH: placement.h,
                  actualW: laidOutChild.w,
                  actualH: laidOutChild.h,
                  reclaimedW: widthDifference,
                  reclaimedH: heightDifference,
                  placementX: placement.x,
                  placementY: placement.y,
                }
              );

              // Update the packer's state to reflect the actual space used
              const packerInstance = (packer as any).packer;
              if (packerInstance && packerInstance.packedItems) {
                // Find and update the packed item for this child
                const packedItemIndex = packerInstance.packedItems.findIndex(
                  (item: any) => item.id === packerInput.id
                );

                if (packedItemIndex !== -1) {
                  // Update the packed item to reflect actual usage
                  packerInstance.packedItems[packedItemIndex].w =
                    laidOutChild.w;
                  packerInstance.packedItems[packedItemIndex].h =
                    laidOutChild.h;

                  // Create free rectangles for the unused space
                  const unusedRects: FreeRectangle[] = [];

                  // Right unused rectangle (if width difference)
                  if (widthDifference > 0) {
                    unusedRects.push({
                      x: placement.x + laidOutChild.w,
                      y: placement.y,
                      w: widthDifference,
                      h: laidOutChild.h, // Only as tall as the actual child
                    });
                  }

                  // Bottom unused rectangle (if height difference)
                  if (heightDifference > 0) {
                    unusedRects.push({
                      x: placement.x,
                      y: placement.y + laidOutChild.h,
                      w: laidOutChild.w, // Only as wide as the actual child
                      h: heightDifference,
                    });
                  }

                  // Bottom-right unused rectangle (if both width and height differences)
                  if (widthDifference > 0 && heightDifference > 0) {
                    unusedRects.push({
                      x: placement.x + laidOutChild.w,
                      y: placement.y + laidOutChild.h,
                      w: widthDifference,
                      h: heightDifference,
                    });
                  }

                  // Add meaningful unused rectangles back to the packer
                  for (const unusedRect of unusedRects) {
                    if (
                      unusedRect.h >= options.leafMinHeight &&
                      unusedRect.w >= options.leafMinWidth
                    ) {
                      packer.addFreeRectangle(unusedRect);

                      console.log(
                        `[DYNAMIC RESIZE] Added unused space back as free rectangle`,
                        {
                          newFreeRect: unusedRect,
                          totalFreeRects: packerInstance.freeRectangles.length,
                        }
                      );
                    }
                  }
                }
              }
            }
          } else {
            // Log when recursive layout returned null (child was skipped internally)
          }
        } else {
          // Log when child allocation is too small
          console.log(
            `[layoutNodeRecursive] CHILD SKIPPED (allocation too small): ${childNode.label} (ID: ${childNode.id}) in container ${node.label}`,
            {
              neededMinW: options.leafMinWidth,
              neededMinH: options.leafMinHeight,
              allocatedW: allocatedCellForChild.w,
              allocatedH: allocatedCellForChild.h,
              packerPlacementW: placement.w,
              packerPlacementH: placement.h,
              reason: "allocatedCellForChild dimensions <= 0",
            }
          );
        }
      } else {
        // Try to fit the item by adapting its dimensions to available space
        console.log(
          `[layoutNodeRecursive] ATTEMPTING ADAPTIVE PLACEMENT: ${childNode.label} (ID: ${childNode.id})`,
          {
            originalW: packerInput.targetW,
            originalH: packerInput.targetH,
            availableW: contentPackingArea.w,
            availableH: contentPackingArea.h,
          }
        );

        // Get the free rectangles from the packer to find actual available spaces
        let bestFitRect: FreeRectangle | null = null;
        let bestFitArea = 0;
        let bestFitScore = 0; // New scoring system
        let bestFitW = 0;
        let bestFitH = 0;

        // Access free rectangles from the underlying Guillotine2DPacker
        const freeRects = (packer as any).packer?.freeRectangles || [];

        console.log(
          `[ADAPTIVE PLACEMENT] Analyzing ${freeRects.length} free rectangles for ${childNode.label}`,
          {
            freeRects: freeRects.map((r: FreeRectangle) => ({
              x: r.x,
              y: r.y,
              w: r.w,
              h: r.h,
              area: r.w * r.h,
            })),
            targetW: packerInput.targetW,
            targetH: packerInput.targetH,
          }
        );

        for (const rect of freeRects) {
          // Calculate what dimensions we could fit in this rectangle
          let fitW = Math.min(packerInput.targetW, rect.w);
          let fitH = Math.min(packerInput.targetH, rect.h);

          // Much more aggressive expansion logic to use available space
          // Always try to expand width if we have extra horizontal space
          if (rect.w > fitW) {
            // Expand width aggressively, but maintain reasonable aspect ratio
            const maxAspectRatio = 6.0; // Allow wider rectangles
            const availableExtraWidth = rect.w - fitW;

            // Use most of the available width unless it creates an extremely wide aspect ratio
            const maxExpandedWidth = Math.min(
              rect.w * 0.98, // Use up to 98% of available width
              fitH * maxAspectRatio // Respect maximum aspect ratio
            );

            fitW = Math.max(fitW, maxExpandedWidth);

            console.log(
              `[ADAPTIVE EXPANSION] ${childNode.label}: expanding width from ${Math.min(packerInput.targetW, rect.w)} to ${fitW} (rect.w: ${rect.w})`
            );
          }

          // Also expand height if beneficial and we have space
          if (rect.h > fitH && rect.w >= fitW * 0.5) {
            // Expand height more conservatively
            const minAspectRatio = 0.15; // Don't make it too tall
            const maxExpandedHeight = Math.min(
              rect.h * 0.95, // Use up to 95% of available height
              fitW / minAspectRatio // Respect minimum aspect ratio
            );
            fitH = Math.max(fitH, maxExpandedHeight);
          }

          // Ensure minimum dimensions
          fitW = Math.max(fitW, options.leafMinWidth);
          fitH = Math.max(fitH, options.leafMinHeight);

          // Check if this rectangle can accommodate the calculated dimensions
          if (rect.w >= fitW && rect.h >= fitH) {
            const area = fitW * fitH;
            const utilizationRatio = area / (rect.w * rect.h);

            // Score based on area and utilization efficiency, heavily favor larger areas
            const score = area * (1 + utilizationRatio);

            if (score > bestFitScore) {
              bestFitScore = score;
              bestFitArea = area;
              bestFitRect = rect;
              bestFitW = fitW;
              bestFitH = fitH;
            }
          }
        }

        if (bestFitRect) {
          const adaptivePlacement: PackerPlacement = {
            id: packerInput.id,
            x: bestFitRect.x,
            y: bestFitRect.y,
            w: bestFitW,
            h: bestFitH,
            fits: true,
          };

          const allocatedCellForChild: Rect = {
            x: parentAllocatedSpace.x + options.padding + adaptivePlacement.x,
            y:
              parentAllocatedSpace.y +
              headerActualHeight +
              options.padding +
              adaptivePlacement.y,
            w: adaptivePlacement.w,
            h: adaptivePlacement.h,
          };

          const laidOutChild = layoutNodeRecursive(
            childNode,
            allocatedCellForChild,
            options,
            depth + 1,
            currentLayoutNode
          );

          if (laidOutChild) {
            currentLayoutNode.children?.push(laidOutChild);

            console.log(
              `[layoutNodeRecursive] CHILD ADAPTIVELY PLACED: ${childNode.label} (ID: ${childNode.id})`,
              {
                originalW: packerInput.targetW,
                originalH: packerInput.targetH,
                adaptiveW: bestFitW,
                adaptiveH: bestFitH,
                finalW: laidOutChild.w,
                finalH: laidOutChild.h,
                placedInRect: {
                  x: bestFitRect.x,
                  y: bestFitRect.y,
                  w: bestFitRect.w,
                  h: bestFitRect.h,
                },
              }
            );

            // Manual rectangle splitting since we're bypassing the normal packer flow
            const packerInstance = (packer as any).packer;
            if (packerInstance && packerInstance.splitRectangle) {
              // Split the rectangle to mark this space as used
              (packer as any).packer.splitRectangle(
                bestFitRect,
                bestFitW,
                laidOutChild.h // Use actual height instead of bestFitH
              );
            }

            // Update packer usage tracking
            const packerInstance2 = (packer as any).packer;
            if (packerInstance2) {
              const rightEdge = bestFitRect.x + bestFitW;
              const bottomEdge = bestFitRect.y + laidOutChild.h; // Use actual height
              packerInstance2.usedWidth = Math.max(
                packerInstance2.usedWidth,
                rightEdge
              );
              packerInstance2.usedHeight = Math.max(
                packerInstance2.usedHeight,
                bottomEdge
              );

              // Add this item to the packed items list
              packerInstance2.packedItems.push({
                id: packerInput.id,
                x: bestFitRect.x,
                y: bestFitRect.y,
                w: bestFitW,
                h: laidOutChild.h, // Use actual height instead of bestFitH
                fits: true,
              });
            }

            console.log(
              `[layoutNodeRecursive] PACKER STATE UPDATED after adaptive placement`,
              {
                newUsedWidth: (packer as any).packer?.usedWidth,
                newUsedHeight: (packer as any).packer?.usedHeight,
                remainingFreeRects:
                  (packer as any).packer?.freeRectangles?.length || 0,
              }
            );
          } else {
            console.log(
              `[layoutNodeRecursive] ADAPTIVE PLACEMENT FAILED (recursive returned null): ${childNode.label} (ID: ${childNode.id})`,
              {
                adaptiveW: adaptivePlacement.w,
                adaptiveH: adaptivePlacement.h,
                rectW: bestFitRect.w,
                rectH: bestFitRect.h,
              }
            );
          }
        } else {
          console.log(
            `[layoutNodeRecursive] CHILD SKIPPED (no suitable free rectangle): ${childNode.label} (ID: ${childNode.id})`,
            {
              originalW: packerInput.targetW,
              originalH: packerInput.targetH,
              minW: options.leafMinWidth,
              minH: options.leafMinHeight,
              availableFreeRects: freeRects.length,
              reason: "no free rectangle can accommodate minimum dimensions",
            }
          );
        }
      }
    }

    // Debug: Show 2D packing visualization
    if (typeof packer.logPackingVisualization === "function") {
      packer.logPackingVisualization(`${node.label || "Container"}-${node.id}`);
    }

    console.log(
      `[layoutNodeRecursive] FINISHED PROCESSING ALL CHILDREN: ${node.label} (ID: ${node.id})`,
      {
        totalChildrenAttempted: sortedPackerItems.length,
        successfullyPlaced: currentLayoutNode.children?.length || 0,
        finalFreeRects: (packer as any).packer?.freeRectangles?.length || 0,
        packerUsedSpace: {
          width: (packer as any).packer?.usedWidth || 0,
          height: packer.getPackedHeight(),
        },
      }
    );

    // Determine Container's Final Dimensions
    const packedContentHeight = packer.getPackedHeight();
    currentLayoutNode.w = parentAllocatedSpace.w; // Typically takes full allocated width
    currentLayoutNode.h = Math.min(
      parentAllocatedSpace.h,
      headerActualHeight +
        packedContentHeight +
        (packedContentHeight > 0 ? options.padding * 2 : options.padding) // top padding is part of contentPackingArea.y
    );
    console.log(
      `[layoutNodeRecursive] CONTAINER FINAL: ${node.label} (ID: ${node.id})`,
      {
        finalW: currentLayoutNode.w,
        finalH: currentLayoutNode.h,
        parentAllocatedW: parentAllocatedSpace.w,
        parentAllocatedH: parentAllocatedSpace.h,
        packedContentHeight,
        headerActualHeight,
        optionsPadding: options.padding,
      }
    );

    if (
      currentLayoutNode.children &&
      currentLayoutNode.children.length === 0 &&
      packedContentHeight === 0
    ) {
      // If it was supposed to be a container but has no visible children and no packed height
      // currentLayoutNode.isContainer = false; // Re-evaluate if it should render as a simple box/leaf
      // or just show header
      currentLayoutNode.h = headerActualHeight;
    }
  }

  // Ensure node dimensions are not smaller than minimums if it's not 'none'
  if (currentLayoutNode.renderMode !== "none") {
    if (
      currentLayoutNode.w < options.leafMinWidth &&
      currentLayoutNode.h < options.leafMinHeight
    ) {
      // if too small for even a leaf, make it none.
      // This is a tough call, might need different min for container vs leaf.
      // For now, if smaller than a leaf's min, it's probably not useful.
      // currentLayoutNode.renderMode = "none"; // Decided against auto-setting to none here, let rendering handle small items.
    } else {
      // currentLayoutNode.w = Math.max(currentLayoutNode.w, options.leafMinWidth);
      // currentLayoutNode.h = Math.max(currentLayoutNode.h, options.leafMinHeight);
    }
  }
  if (
    isNaN(currentLayoutNode.w) ||
    isNaN(currentLayoutNode.h) ||
    isNaN(currentLayoutNode.x) ||
    isNaN(currentLayoutNode.y)
  ) {
    // Provide default values to prevent SVG errors, though layout will be wrong.
    currentLayoutNode.x = currentLayoutNode.x || 0;
    currentLayoutNode.y = currentLayoutNode.y || 0;
    currentLayoutNode.w = currentLayoutNode.w || options.leafMinWidth;
    currentLayoutNode.h = currentLayoutNode.h || options.leafMinHeight;
  }

  return currentLayoutNode;
}
