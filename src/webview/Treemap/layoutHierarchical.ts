import { ScopeNode } from "../../types";
import { Guillotine2DPacker } from "./Guillotine2DPacker";

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
  freeRectangles?: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    containerPath: string; // To identify which container these free rects belong to
  }>;
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
export interface PackerInputItem {
  id: string;
  targetW: number;
  targetH: number;
  node: ScopeNode; // Keep original node for value access or other properties
}

export interface PackerPlacement {
  id: string;
  x: number;
  y: number;
  w: number; // Actual width allocated
  h: number; // Actual height allocated
  fits: boolean;
}

export interface FreeRectangle {
  x: number;
  y: number;
  w: number;
  h: number;
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

// --- Main Layout Function ---
export type HierarchicalLayoutFn = (
  rootNode: ScopeNode,
  viewportWidth: number,
  viewportHeight: number,
  options: HierarchicalLayoutOptions
) => HierarchicalLayoutNode;

// Function to calculate values for all nodes recursively before layout
function calculateNodeValues(node: ScopeNode): number {
  if (!node.children || node.children.length === 0) {
    // Leaf node gets value of 1
    node.value = 1;
    return 1;
  }

  // Container node - sum of children's values
  let totalValue = 0;
  for (const child of node.children) {
    totalValue += calculateNodeValues(child);
  }

  node.value = totalValue;
  return totalValue;
}

export const layoutHierarchical: HierarchicalLayoutFn = (
  rootNode,
  viewportWidth,
  viewportHeight,
  options
) => {
  // Calculate values for all nodes before starting layout
  calculateNodeValues(rootNode);

  const layoutRoot = layoutNodeRecursive(
    rootNode,
    { x: 0, y: 0, w: viewportWidth, h: viewportHeight },
    options,
    0, // depth
    undefined // parent
  );

  // Add overlap detection and logging
  if (layoutRoot) {
    const allNodes = collectAllLayoutNodes(layoutRoot);
    const overlaps = detectOverlaps(allNodes);

    if (overlaps.length > 0) {
      // Apply overlap corrections
      let correctionsMade = 0;

      for (const overlap of overlaps) {
        const { nodeA, nodeB } = overlap;

        // Simple correction strategy: move the node with higher Y coordinate down
        // This preserves the general layout while fixing overlaps
        const nodeToMove = nodeA.y > nodeB.y ? nodeA : nodeB;
        const staticNode = nodeA.y > nodeB.y ? nodeB : nodeA;

        // Calculate how much to move the node
        const requiredYMove =
          staticNode.y + staticNode.h - nodeToMove.y + options.padding;

        if (requiredYMove > 0) {
          nodeToMove.y += requiredYMove;
          correctionsMade++;

          // Also adjust any children's positions accordingly
          if (nodeToMove.children) {
            adjustChildrenPositions(nodeToMove, 0, requiredYMove);
          }
        }
      }

      if (correctionsMade > 0) {
        // Re-check for any remaining overlaps
        const remainingOverlaps = detectOverlaps(
          collectAllLayoutNodes(layoutRoot)
        );
        if (remainingOverlaps.length > 0) {
          console.warn(`${remainingOverlaps.length} overlaps still remain`);
        }
      }

      // Log remaining overlaps for debugging
      overlaps.forEach((overlap, index) => {
        console.error(
          `  ${index + 1}. "${overlap.nodeA.node.label || overlap.nodeA.node.id}" overlaps "${overlap.nodeB.node.label || overlap.nodeB.node.id}"`
        );
        console.error(
          `     A: [${overlap.nodeA.x.toFixed(1)}, ${overlap.nodeA.y.toFixed(1)}, ${overlap.nodeA.w.toFixed(1)}x${overlap.nodeA.h.toFixed(1)}]`
        );
        console.error(
          `     B: [${overlap.nodeB.x.toFixed(1)}, ${overlap.nodeB.y.toFixed(1)}, ${overlap.nodeB.w.toFixed(1)}x${overlap.nodeB.h.toFixed(1)}]`
        );
        console.error(
          `     Overlap area: ${overlap.overlapArea.toFixed(1)} px²`
        );
      });
    } else {
      console.log(`✅ No overlaps detected`);
    }
  } else {
    console.warn(`⚠️ Layout root is null, cannot check for overlaps`);
  }

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

// Helper functions for overlap detection
function collectAllLayoutNodes(
  root: HierarchicalLayoutNode | null
): HierarchicalLayoutNode[] {
  if (!root) return [];

  const nodes: HierarchicalLayoutNode[] = [root];
  if (root.children) {
    for (const child of root.children) {
      nodes.push(...collectAllLayoutNodes(child));
    }
  }
  return nodes;
}

// Helper function to adjust children positions recursively
function adjustChildrenPositions(
  parent: HierarchicalLayoutNode,
  deltaX: number,
  deltaY: number
): void {
  if (!parent.children) return;

  for (const child of parent.children) {
    child.x += deltaX;
    child.y += deltaY;

    // Recursively adjust grandchildren
    if (child.children) {
      adjustChildrenPositions(child, deltaX, deltaY);
    }
  }
}

interface OverlapInfo {
  nodeA: HierarchicalLayoutNode;
  nodeB: HierarchicalLayoutNode;
  overlapArea: number;
}

function detectOverlaps(nodes: HierarchicalLayoutNode[]): OverlapInfo[] {
  const overlaps: OverlapInfo[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      if (!nodeA || !nodeB) continue;

      // Skip if one is ancestor of the other
      if (isAncestor(nodeA, nodeB) || isAncestor(nodeB, nodeA)) {
        continue;
      }

      const overlapArea = calculateOverlapArea(nodeA, nodeB);
      if (overlapArea > 0.1) {
        // Small tolerance for floating point errors
        overlaps.push({ nodeA, nodeB, overlapArea });
      }
    }
  }

  return overlaps;
}

function isAncestor(
  ancestor: HierarchicalLayoutNode | undefined,
  descendant: HierarchicalLayoutNode | undefined
): boolean {
  if (!ancestor || !descendant) return false;

  let current = descendant?.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function calculateOverlapArea(
  nodeA: HierarchicalLayoutNode | undefined,
  nodeB: HierarchicalLayoutNode | undefined
): number {
  if (!nodeA || !nodeB) return 0;

  const left = Math.max(nodeA.x, nodeB.x);
  const right = Math.min(nodeA.x + nodeA.w, nodeB.x + nodeB.w);
  const top = Math.max(nodeA.y, nodeB.y);
  const bottom = Math.min(nodeA.y + nodeA.h, nodeB.y + nodeB.h);

  if (left < right && top < bottom) {
    return (right - left) * (bottom - top);
  }
  return 0;
}

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
    return null;
  }
  if (
    isNaN(parentAllocatedSpace.w) ||
    isNaN(parentAllocatedSpace.h) ||
    isNaN(parentAllocatedSpace.x) ||
    isNaN(parentAllocatedSpace.y)
  ) {
    return null;
  }

  const isEffectivelyLeaf = !node.children || node.children.length === 0;

  // For containers with very small allocated space, render as simple box instead of skipping
  if (
    !isEffectivelyLeaf &&
    (parentAllocatedSpace.w < options.leafMinWidth ||
      parentAllocatedSpace.h < options.leafMinHeight)
  ) {
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

    // Expand to fill allocated space when possible - this is the key fix!
    // Check if we can expand width to fill available space
    if (parentAllocatedSpace.w > targetW) {
      // Expand width but maintain reasonable aspect ratio
      const maxExpansionRatio = 4; // Allow up to 4x expansion from preferred
      const maxAllowedWidth = Math.min(
        parentAllocatedSpace.w,
        options.leafPrefWidth * maxExpansionRatio
      );
      targetW = maxAllowedWidth;

      // For very wide nodes, also expand height proportionally to maintain some aspect ratio
      const aspectRatio = targetW / targetH;
      if (aspectRatio > 6) {
        // If getting very wide
        const minReasonableHeight = Math.min(
          options.leafPrefHeight * 1.5,
          parentAllocatedSpace.h
        );
        targetH = Math.max(targetH, minReasonableHeight);
      }
    }

    // Check if we can expand height to fill available space (less aggressive)
    if (parentAllocatedSpace.h > targetH) {
      const heightExpansionRatio = Math.min(
        2, // Allow up to 2x height expansion
        parentAllocatedSpace.h / targetH
      );
      targetH = Math.min(
        targetH * heightExpansionRatio,
        parentAllocatedSpace.h
      );
    }

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

    const packer = new Guillotine2DPacker(
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
        // Is a Leaf - use preferred sizing and let the packer handle optimal placement
        // Start with preferred dimensions
        childTargetW = options.leafPrefWidth;
        childTargetH = options.leafPrefHeight;

        // For small containers with few children, allow some expansion to better use space
        if (childrenToLayout.length <= 3) {
          // Allow expansion up to a reasonable portion of available space
          const maxExpandedW = Math.min(
            contentPackingArea.w * 0.7, // Use up to 70% of width
            options.leafPrefWidth * 2.5 // But don't exceed 2.5x preferred width
          );
          childTargetW = Math.max(childTargetW, maxExpandedW);
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

    // Width expansion optimization for low utilization scenarios
    if (utilizationRatio < 0.5 && sortedPackerItems.length > 0) {
      // Calculate how much extra width we can distribute
      const totalCurrentWidth = sortedPackerItems.reduce(
        (sum, item) => sum + item.targetW,
        0
      );
      const availableWidth = contentPackingArea.w;
      const extraWidth = availableWidth - totalCurrentWidth;

      if (extraWidth > 0) {
        // Distribute extra width proportionally, but cap expansion
        for (const item of sortedPackerItems) {
          const isLeaf = !item.node.children || item.node.children.length === 0;
          if (isLeaf) {
            const currentRatio = item.targetW / totalCurrentWidth;
            const additionalWidth = extraWidth * currentRatio;
            const maxExpansion = Math.min(
              additionalWidth,
              item.targetW * 2.5, // Don't expand more than 2.5x original
              availableWidth * 0.8 // Don't use more than 80% of available width
            );

            const newWidth = item.targetW + maxExpansion;
            item.targetW = newWidth;
          }
        }
      }
    }

    // Very aggressive expansion for extremely low utilization
    if (utilizationRatio < 0.1 && sortedPackerItems.length > 0) {
      for (const item of sortedPackerItems) {
        const isLeaf = !item.node.children || item.node.children.length === 0;
        if (isLeaf) {
          // For very low utilization, be more aggressive with width expansion
          const expandedWidth = Math.min(
            contentPackingArea.w * 0.8, // Use up to 80% of container width
            item.targetW * 4 // Or up to 4x the original width
          );

          item.targetW = expandedWidth;
        }
      }
    }

    for (const packerInput of sortedPackerItems) {
      const childNode = packerInput.node;

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

            // Enhanced Dynamic Container Resizing: Handle both container AND leaf children that use less space
            // Calculate differences using the SAME coordinate system - absolute coordinates first for logging
            const absoluteHeightDiff = placement.h - laidOutChild.h;
            const absoluteWidthDiff = placement.w - laidOutChild.w;

            if (absoluteHeightDiff > 0 || absoluteWidthDiff > 0) {
              // CRITICAL FIX: Only reclaim significant amounts of space and use strict validation
              const minReclaimableWidth = options.leafMinWidth * 0.8;
              const minReclaimableHeight = options.leafMinHeight * 0.8;

              // Only proceed if the freed space is significant enough to be useful
              if (
                absoluteWidthDiff >= minReclaimableWidth ||
                absoluteHeightDiff >= minReclaimableHeight
              ) {
                // Update the packer's state to reflect the actual space used
                const packerInstance = packer;
                if (packerInstance && packerInstance.packedItems) {
                  // Find and update the packed item for this child
                  const packedItemIndex = packerInstance.packedItems.findIndex(
                    (item: any) => item.id === packerInput.id
                  );

                  if (packedItemIndex !== -1) {
                    // Update the packed item to reflect actual usage in PACKER coordinates
                    const originalPackedItem =
                      packerInstance.packedItems[packedItemIndex];
                    packerInstance.packedItems[packedItemIndex] = {
                      ...originalPackedItem,
                      w: laidOutChild.w,
                      h: laidOutChild.h,
                    } as PackerPlacement;

                    // Create free rectangles for the unused space - ALL IN PACKER COORDINATES
                    const unusedRects: FreeRectangle[] = [];

                    // Only create right rectangle if width difference is significant
                    if (absoluteWidthDiff >= minReclaimableWidth) {
                      const rightRect = {
                        x: placement.x + laidOutChild.w, // PACKER coordinates
                        y: placement.y, // PACKER coordinates
                        w: absoluteWidthDiff,
                        h: laidOutChild.h,
                      };

                      // Validate that this rectangle is within bounds
                      if (
                        rightRect.x + rightRect.w <= contentPackingArea.w &&
                        rightRect.y + rightRect.h <= contentPackingArea.h
                      ) {
                        unusedRects.push(rightRect);
                      }
                    }

                    // Only create bottom rectangle if height difference is significant
                    if (absoluteHeightDiff >= minReclaimableHeight) {
                      // Create bottom rectangle spanning only the child's width to avoid overlaps
                      const bottomRect = {
                        x: placement.x, // PACKER coordinates
                        y: placement.y + laidOutChild.h, // PACKER coordinates
                        w: laidOutChild.w, // Use actual child width, not allocated width
                        h: absoluteHeightDiff,
                      };

                      // Validate that this rectangle is within bounds
                      if (
                        bottomRect.x + bottomRect.w <= contentPackingArea.w &&
                        bottomRect.y + bottomRect.h <= contentPackingArea.h
                      ) {
                        unusedRects.push(bottomRect);
                      }
                    }

                    // Strict validation: only add rectangles that don't overlap with existing items
                    for (const unusedRect of unusedRects) {
                      const rectArea = unusedRect.w * unusedRect.h;
                      const minUsefulArea =
                        options.leafMinWidth * options.leafMinHeight * 0.5;

                      // Check if rectangle is large enough to be useful
                      if (rectArea >= minUsefulArea) {
                        // CRITICAL: Check for overlaps with ALL existing packed items
                        let overlapsWithExisting = false;
                        const existingItems = packerInstance.packedItems || [];

                        for (const existingItem of existingItems) {
                          if (existingItem.id === packerInput.id) continue; // Skip self

                          // Check for overlap using strict bounds checking
                          const overlapX = !(
                            existingItem.x >= unusedRect.x + unusedRect.w ||
                            existingItem.x + existingItem.w <= unusedRect.x
                          );
                          const overlapY = !(
                            existingItem.y >= unusedRect.y + unusedRect.h ||
                            existingItem.y + existingItem.h <= unusedRect.y
                          );

                          if (overlapX && overlapY) {
                            overlapsWithExisting = true;
                            break;
                          }
                        }

                        if (!overlapsWithExisting) {
                          // Additional validation: check against existing free rectangles to prevent duplicates
                          let duplicatesExistingFree = false;
                          const existingFreeRects =
                            packerInstance.freeRectangles || [];

                          for (const existingFree of existingFreeRects) {
                            // Check if this rectangle significantly overlaps with existing free rectangles
                            const overlapX = !(
                              existingFree.x >= unusedRect.x + unusedRect.w ||
                              existingFree.x + existingFree.w <= unusedRect.x
                            );
                            const overlapY = !(
                              existingFree.y >= unusedRect.y + unusedRect.h ||
                              existingFree.y + existingFree.h <= unusedRect.y
                            );

                            if (overlapX && overlapY) {
                              duplicatesExistingFree = true;
                              break;
                            }
                          }

                          if (!duplicatesExistingFree) {
                            packer.addFreeRectangle(unusedRect);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        // Try to fit the item by adapting its dimensions to available space

        // Get the free rectangles from the packer to find actual available spaces
        let bestFitRect: FreeRectangle | null = null;
        let bestFitScore = 0; // New scoring system
        let bestFitW = 0;
        let bestFitH = 0;

        // Access free rectangles from the underlying Guillotine2DPacker
        const freeRects = packer?.freeRectangles || [];

        for (const rect of freeRects) {
          // Calculate what dimensions we could fit in this rectangle
          let fitW = Math.min(packerInput.targetW, rect.w);
          let fitH = Math.min(packerInput.targetH, rect.h);

          // Extremely aggressive expansion logic to maximize space utilization
          // Try to use as much of the available rectangle as possible

          // First, determine if we should expand width, height, or both
          const availableExtraWidth = rect.w - fitW;
          const availableExtraHeight = rect.h - fitH;

          // Prioritize filling the larger available dimension
          if (
            availableExtraWidth >= availableExtraHeight &&
            availableExtraWidth > 0
          ) {
            // Focus on width expansion first
            const maxAspectRatio = 8.0; // Allow very wide rectangles for better space usage
            const maxExpandedWidth = Math.min(
              rect.w * 0.99, // Use up to 99% of available width
              Math.max(
                fitH * maxAspectRatio, // Respect maximum aspect ratio
                options.leafPrefWidth * 4 // But allow significant expansion from preferred
              )
            );

            fitW = Math.max(fitW, maxExpandedWidth);

            // After width expansion, see if we can also expand height
            if (availableExtraHeight > 0) {
              const minAspectRatio = 0.12; // Allow tall rectangles too
              const maxExpandedHeight = Math.min(
                rect.h * 0.95,
                Math.max(fitW / minAspectRatio, options.leafPrefHeight * 3)
              );
              fitH = Math.max(fitH, maxExpandedHeight);
            }
          } else if (availableExtraHeight > 0) {
            // Focus on height expansion first
            const minAspectRatio = 0.1; // Allow very tall rectangles
            const maxExpandedHeight = Math.min(
              rect.h * 0.99, // Use up to 99% of available height
              Math.max(
                fitW / minAspectRatio,
                options.leafPrefHeight * 4 // Allow significant expansion
              )
            );

            fitH = Math.max(fitH, maxExpandedHeight);

            // After height expansion, see if we can also expand width
            if (availableExtraWidth > 0) {
              const maxAspectRatio = 10.0; // Allow very wide rectangles
              const maxExpandedWidth = Math.min(
                rect.w * 0.95,
                Math.max(fitH * maxAspectRatio, options.leafPrefWidth * 3)
              );
              fitW = Math.max(fitW, maxExpandedWidth);
            }
          }

          // Ensure minimum dimensions
          fitW = Math.max(fitW, options.leafMinWidth);
          fitH = Math.max(fitH, options.leafMinHeight);

          // Check if this rectangle can accommodate the calculated dimensions
          if (rect.w >= fitW && rect.h >= fitH) {
            const area = fitW * fitH;
            const utilizationRatio = area / (rect.w * rect.h);

            // Enhanced scoring system that prioritizes tighter packing:
            // 1. Position preference (prefer top-left for tighter packing) - PRIMARY factor for tight packing
            // 2. Area (larger is better) - secondary factor
            // 3. Utilization efficiency (higher utilization is better) - tertiary factor
            // 4. Aspect ratio consideration - gentle guidance

            // Position preference: HEAVILY favor rectangles with smaller y coordinates (top bias for vertical tightness)
            // Use the actual container dimensions for proper normalization instead of arbitrary maxCoordinate
            const containerW = contentPackingArea.w;
            const containerH = contentPackingArea.h;

            // Primary score component: position - heavily weighted to achieve tight vertical packing
            // Y position is the most important - multiply by large factor to dominate other considerations
            const yPositionScore = (containerH - rect.y) * 1000; // Very strong preference for top placement
            const xPositionScore = (containerW - rect.x) * 10; // Moderate preference for left placement
            const positionScore = yPositionScore + xPositionScore;

            // Secondary score components - much smaller weights
            const areaScore = area * 0.1; // Reduced weight for area
            const utilizationScore = utilizationRatio * 100; // Reduced weight for utilization

            // Aspect ratio consideration: slight penalty for extreme aspect ratios to maintain readability
            const aspectRatio = fitW / fitH;
            const aspectPenalty = Math.abs(Math.log(aspectRatio)) * 5; // Reduced penalty weight

            // Combined score: position is PRIMARY, everything else is secondary
            const score =
              positionScore + areaScore + utilizationScore - aspectPenalty;

            if (score > bestFitScore) {
              bestFitScore = score;
              bestFitRect = rect;
              bestFitW = fitW;
              bestFitH = fitH;
            }
          }
        }

        if (bestFitRect) {
          // Additional validation before placing: ensure the placement won't exceed container bounds
          const wouldExceedWidth =
            bestFitRect.x + bestFitW > contentPackingArea.w;
          const wouldExceedHeight =
            bestFitRect.y + bestFitH > contentPackingArea.h;

          if (!wouldExceedWidth && !wouldExceedHeight) {
            // Check one more time for overlaps with existing packed items
            let hasOverlapWithPacked = false;

            if (packer && packer.packedItems) {
              const existingItems = packer.packedItems || [];

              for (const existingItem of existingItems) {
                const overlapX = !(
                  existingItem.x >= bestFitRect.x + bestFitW ||
                  existingItem.x + existingItem.w <= bestFitRect.x
                );
                const overlapY = !(
                  existingItem.y >= bestFitRect.y + bestFitH ||
                  existingItem.y + existingItem.h <= bestFitRect.y
                );

                if (overlapX && overlapY) {
                  hasOverlapWithPacked = true;
                  break;
                }
              }
            }

            if (!hasOverlapWithPacked) {
              const adaptivePlacement: PackerPlacement = {
                id: packerInput.id,
                x: bestFitRect.x,
                y: bestFitRect.y,
                w: bestFitW,
                h: bestFitH,
                fits: true,
              };

              const allocatedCellForChild: Rect = {
                x:
                  parentAllocatedSpace.x +
                  options.padding +
                  adaptivePlacement.x,
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

                // Manual rectangle splitting since we're bypassing the normal packer flow
                if (packer && packer.splitRectangle) {
                  // Split the rectangle to mark this space as used
                  packer.splitRectangle(
                    bestFitRect,
                    bestFitW,
                    laidOutChild.h // Use actual height instead of bestFitH
                  );
                }

                // Update packer usage tracking
                if (packer) {
                  const rightEdge = bestFitRect.x + bestFitW;
                  const bottomEdge = bestFitRect.y + laidOutChild.h; // Use actual height
                  packer.usedWidth = Math.max(packer.usedWidth, rightEdge);
                  packer.usedHeight = Math.max(packer.usedHeight, bottomEdge);

                  // Add this item to the packed items list
                  packer.packedItems.push({
                    id: packerInput.id,
                    x: bestFitRect.x,
                    y: bestFitRect.y,
                    w: bestFitW,
                    h: laidOutChild.h, // Use actual height instead of bestFitH
                    fits: true,
                  });
                }
              }
            }
          }
        }
      }
    }

    // COLLECT FREE RECTANGLES FOR DEBUGGING VISUALIZATION
    if (packer && packer.freeRectangles) {
      const freeRects = packer.freeRectangles.map((rect: FreeRectangle) => ({
        // Convert packer-relative coordinates to absolute coordinates
        x: parentAllocatedSpace.x + options.padding + rect.x,
        y:
          parentAllocatedSpace.y +
          headerActualHeight +
          options.padding +
          rect.y,
        w: rect.w,
        h: rect.h,
        containerPath: `${node.label || "Container"}(${node.id})`,
      }));

      // Filter out rectangles that are too small to be useful
      const meaningfulFreeRects = freeRects.filter(
        (rect: any) =>
          rect.w >= options.leafMinWidth * 0.5 &&
          rect.h >= options.leafMinHeight * 0.5
      );

      if (meaningfulFreeRects.length > 0) {
        currentLayoutNode.freeRectangles = meaningfulFreeRects;
      }
    }

    // Determine Container's Final Dimensions - Use actual child heights instead of packer height
    // The packer height doesn't account for children that use less space than allocated
    let actualContentHeight = 0;

    if (currentLayoutNode.children && currentLayoutNode.children.length > 0) {
      // Calculate the actual content height based on positioned children
      let maxChildBottomRelative = 0;

      for (const child of currentLayoutNode.children) {
        // Convert child position to relative coordinates within this container's content area
        const childRelativeY =
          child.y -
          (parentAllocatedSpace.y + headerActualHeight + options.padding);
        const childBottomRelative = childRelativeY + child.h;
        maxChildBottomRelative = Math.max(
          maxChildBottomRelative,
          childBottomRelative
        );
      }

      actualContentHeight = maxChildBottomRelative;
    } else {
      actualContentHeight = 0;
    }

    currentLayoutNode.w = parentAllocatedSpace.w; // Typically takes full allocated width
    currentLayoutNode.h = Math.min(
      parentAllocatedSpace.h,
      headerActualHeight +
        actualContentHeight +
        (actualContentHeight > 0 ? options.padding * 2 : options.padding) // top padding is part of contentPackingArea.y
    );

    if (
      currentLayoutNode.children &&
      currentLayoutNode.children.length === 0 &&
      actualContentHeight === 0
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
