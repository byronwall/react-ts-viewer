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
    // Find best rectangle using heuristic that prioritizes horizontal filling
    const bestRect = this.findBestRectangleWithHorizontalBias(
      item.targetW,
      item.targetH
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

        // Add strong position bias for tighter packing: heavily favor top-left positions
        // This should force horizontal filling before vertical stacking
        const positionBias = rect.y * 2.0 + rect.x * 0.5; // Much stronger bias, heavily favor smaller y coordinates
        const adjustedScore = score + positionBias;
        const adjustedSecondaryScore = secondaryScore + positionBias;

        if (
          adjustedScore < bestScore ||
          (adjustedScore === bestScore &&
            adjustedSecondaryScore < bestSecondaryScore)
        ) {
          bestRect = rect;
          bestScore = adjustedScore;
          bestSecondaryScore = adjustedSecondaryScore;
        }
      }
    }

    return bestRect;
  }

  private findBestRectangleWithHorizontalBias(
    width: number,
    height: number
  ): FreeRectangle | null {
    let bestRect: FreeRectangle | null = null;
    let bestScore = Number.MAX_SAFE_INTEGER;

    // Calculate space needed including padding
    const needW =
      width + (this.packedItems.length > 0 ? this.interItemPadding : 0);
    const needH =
      height + (this.packedItems.length > 0 ? this.interItemPadding : 0);

    for (const rect of this.freeRectangles) {
      if (rect.w >= needW && rect.h >= needH) {
        // Custom scoring that strongly favors horizontal filling over vertical stacking
        // Primary: prefer rectangles with smaller Y coordinates (fill top row first)
        // Secondary: prefer rectangles with smaller X coordinates (fill left to right)
        // Tertiary: prefer tighter fits (smaller remaining area)

        const yBias = rect.y * 1000; // Very strong preference for top rows
        const xBias = rect.x * 10; // Moderate preference for left columns
        const remainingArea = (rect.w - needW) * (rect.h - needH);
        const areaBias = remainingArea * 0.1; // Light preference for tighter fits

        const score = yBias + xBias + areaBias;

        if (score < bestScore) {
          bestRect = rect;
          bestScore = score;
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
    const minUsefulWidth = 15; // Reduced minimum to capture more space
    const minUsefulHeight = 8; // Reduced minimum to capture more space

    // Strategy: prioritize creating larger rectangles that span more space
    // This helps with later merging and reduces fragmentation

    // Right rectangle (vertical split) - make it span the full height when possible
    if (rightWidth >= minUsefulWidth) {
      const rightHeight = rect.h; // Use full height, not just the placed item height
      if (rightHeight >= minUsefulHeight) {
        this.freeRectangles.push({
          x: rect.x + width,
          y: rect.y, // Start from top of original rectangle
          w: rightWidth,
          h: rightHeight, // Full height for better merging potential
        });
      }
    }

    // Bottom rectangle (horizontal split) - prefer wider rectangles for better packing
    if (bottomHeight >= minUsefulHeight) {
      let bottomWidth = rect.w; // Use full width by default for better merging potential
      let bottomX = rect.x; // Start from left edge of original rectangle

      // Only reduce width if we created a right rectangle and it would cause overlap
      if (rightWidth >= minUsefulWidth) {
        // We created a right rectangle, so the bottom rectangle should only use the placed item's width
        // to avoid overlap with the right rectangle
        bottomWidth = width;
        bottomX = rect.x;
      }

      if (bottomWidth >= minUsefulWidth) {
        this.freeRectangles.push({
          x: bottomX,
          y: rect.y + height,
          w: bottomWidth,
          h: bottomHeight,
        });
      }
    }

    // Clean up overlapping rectangles and merge aggressively
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

    // Merge adjacent rectangles to reduce fragmentation - run multiple times to catch all merges
    this.mergeAdjacentRectangles();

    // Run an additional aggressive merge pass specifically for vertical adjacency
    this.aggressiveVerticalMerge();
  }

  private mergeAdjacentRectangles(): void {
    let merged = true;
    let iterations = 0;
    const maxIterations = 10; // Prevent infinite loops
    let totalMerges = 0;

    // Reduce logging spam - only log if significant merges happen
    const initialRectCount = this.freeRectangles.length;

    while (merged && iterations < maxIterations) {
      merged = false;
      iterations++;

      // Try to merge rectangles horizontally (same Y, height, and adjacent X coordinates)
      for (let i = 0; i < this.freeRectangles.length; i++) {
        const rectA = this.freeRectangles[i];
        if (!rectA) continue;

        for (let j = i + 1; j < this.freeRectangles.length; j++) {
          const rectB = this.freeRectangles[j];
          if (!rectB) continue;

          // Check if rectangles can be merged horizontally
          if (this.canMergeHorizontally(rectA, rectB)) {
            const mergedRect = this.mergeHorizontally(rectA, rectB);

            // Remove the two original rectangles and add the merged one
            this.freeRectangles.splice(Math.max(i, j), 1);
            this.freeRectangles.splice(Math.min(i, j), 1);
            this.freeRectangles.push(mergedRect);

            merged = true;
            totalMerges++;
            break;
          }
          // Check if rectangles can be merged vertically
          else if (this.canMergeVertically(rectA, rectB)) {
            const mergedRect = this.mergeVertically(rectA, rectB);

            // Remove the two original rectangles and add the merged one
            this.freeRectangles.splice(Math.max(i, j), 1);
            this.freeRectangles.splice(Math.min(i, j), 1);
            this.freeRectangles.push(mergedRect);

            merged = true;
            totalMerges++;
            break;
          }
        }

        if (merged) break;
      }
    }

    const finalRectCount = this.freeRectangles.length;
    // Only log if significant changes occurred
    if (totalMerges > 0 || initialRectCount > 3) {
      console.log(
        `🔗 Standard merge: ${initialRectCount} → ${finalRectCount} rectangles (${totalMerges} merges)`
      );
    }
  }

  private canMergeHorizontally(
    rectA: FreeRectangle,
    rectB: FreeRectangle
  ): boolean {
    // Two rectangles can be merged horizontally if:
    // 1. They have the same Y coordinate and height
    // 2. One rectangle's right edge touches the other's left edge
    const tolerance = 3.0; // Increased tolerance to handle more edge cases

    const sameY = Math.abs(rectA.y - rectB.y) <= tolerance;
    const sameHeight = Math.abs(rectA.h - rectB.h) <= tolerance;

    if (!sameY || !sameHeight) return false;

    // Check if A's right edge touches B's left edge (with tolerance for padding gaps)
    const aRightTouchesBLeft =
      Math.abs(rectA.x + rectA.w - rectB.x) <= tolerance;
    // Check if B's right edge touches A's left edge (with tolerance for padding gaps)
    const bRightTouchesALeft =
      Math.abs(rectB.x + rectB.w - rectA.x) <= tolerance;

    return aRightTouchesBLeft || bRightTouchesALeft;
  }

  private canMergeVertically(
    rectA: FreeRectangle,
    rectB: FreeRectangle
  ): boolean {
    // Two rectangles can be merged vertically if:
    // 1. They have the same X coordinate and width
    // 2. One rectangle's bottom edge touches the other's top edge (or they're very close due to padding)
    const tolerance = 3.0; // Increased tolerance to handle more edge cases

    const sameX = Math.abs(rectA.x - rectB.x) <= tolerance;
    const sameWidth = Math.abs(rectA.w - rectB.w) <= tolerance;

    if (!sameX || !sameWidth) return false;

    // Check if A's bottom edge touches B's top edge (with tolerance for padding gaps)
    const aBottomTouchesBTop =
      Math.abs(rectA.y + rectA.h - rectB.y) <= tolerance;
    // Check if B's bottom edge touches A's top edge (with tolerance for padding gaps)
    const bBottomTouchesATop =
      Math.abs(rectB.y + rectB.h - rectA.y) <= tolerance;

    return aBottomTouchesBTop || bBottomTouchesATop;
  }

  private mergeHorizontally(
    rectA: FreeRectangle,
    rectB: FreeRectangle
  ): FreeRectangle {
    // Determine which rectangle is on the left
    const leftRect = rectA.x <= rectB.x ? rectA : rectB;
    const rightRect = rectA.x <= rectB.x ? rectB : rectA;

    // Calculate the merged width by spanning from leftmost x to rightmost x+w
    // This handles cases where there might be small gaps due to padding
    const mergedWidth = rightRect.x + rightRect.w - leftRect.x;

    return {
      x: leftRect.x,
      y: leftRect.y, // Should be approximately the same as rightRect.y
      w: mergedWidth,
      h: leftRect.h, // Should be approximately the same as rightRect.h
    };
  }

  private mergeVertically(
    rectA: FreeRectangle,
    rectB: FreeRectangle
  ): FreeRectangle {
    // Determine which rectangle is on top
    const topRect = rectA.y <= rectB.y ? rectA : rectB;
    const bottomRect = rectA.y <= rectB.y ? rectB : rectA;

    // Calculate the merged height by spanning from topmost y to bottommost y+h
    // This handles cases where there might be small gaps due to padding
    const mergedHeight = bottomRect.y + bottomRect.h - topRect.y;

    return {
      x: topRect.x, // Should be approximately the same as bottomRect.x
      y: topRect.y,
      w: topRect.w, // Should be approximately the same as bottomRect.w
      h: mergedHeight,
    };
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
    // Visualization removed to reduce console output
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

  // New method to aggressively merge vertically adjacent rectangles
  private aggressiveVerticalMerge(): void {
    // Don't log every call - only when we find substantial rectangles to work with
    const shouldLog = this.freeRectangles.length > 2;

    let mergesMade = 0;
    let iterations = 0;
    const maxIterations = 8; // Increased iterations for more thorough merging

    while (iterations < maxIterations) {
      let foundMerge = false;
      iterations++;

      // Sort rectangles by X then Y to process in a more systematic way
      this.freeRectangles.sort((a, b) => {
        if (Math.abs(a.x - b.x) < 2) {
          return a.y - b.y; // Same X, sort by Y
        }
        return a.x - b.x; // Different X, sort by X
      });

      for (let i = 0; i < this.freeRectangles.length; i++) {
        const rectA = this.freeRectangles[i];
        if (!rectA) continue;

        for (let j = i + 1; j < this.freeRectangles.length; j++) {
          const rectB = this.freeRectangles[j];
          if (!rectB) continue;

          // Much more aggressive merge criteria
          const xAlignment = Math.abs(rectA.x - rectB.x) <= 8.0; // Increased from 5.0
          const widthSimilarity =
            Math.abs(rectA.w - rectB.w) <=
            Math.max(20.0, Math.min(rectA.w, rectB.w) * 0.3); // Allow up to 30% width difference

          if (xAlignment && widthSimilarity) {
            // Check if they're vertically adjacent (with very generous tolerance)
            const aBottomToBTop = Math.abs(rectA.y + rectA.h - rectB.y);
            const bBottomToATop = Math.abs(rectB.y + rectB.h - rectA.y);
            const verticalGap = Math.min(aBottomToBTop, bBottomToATop);

            if (verticalGap <= 15.0) {
              // Increased from 8.0 to 15.0 pixels
              // Merge them using the leftmost X and widest width
              const mergedX = Math.min(rectA.x, rectB.x);
              const mergedW =
                Math.max(rectA.x + rectA.w, rectB.x + rectB.w) - mergedX;
              const mergedY = Math.min(rectA.y, rectB.y);
              const mergedH =
                Math.max(rectA.y + rectA.h, rectB.y + rectB.h) - mergedY;

              const mergedRect: FreeRectangle = {
                x: mergedX,
                y: mergedY,
                w: mergedW,
                h: mergedH,
              };

              if (shouldLog) {
                console.log(
                  `🔗 Aggressive merge: [${rectA.x.toFixed(1)},${rectA.y.toFixed(1)},${rectA.w.toFixed(1)}x${rectA.h.toFixed(1)}] + [${rectB.x.toFixed(1)},${rectB.y.toFixed(1)},${rectB.w.toFixed(1)}x${rectB.h.toFixed(1)}] → [${mergedRect.x.toFixed(1)},${mergedRect.y.toFixed(1)},${mergedRect.w.toFixed(1)}x${mergedRect.h.toFixed(1)}] (gap: ${verticalGap.toFixed(1)})`
                );
              }

              // Remove the original rectangles and add the merged one
              this.freeRectangles.splice(Math.max(i, j), 1);
              this.freeRectangles.splice(Math.min(i, j), 1);
              this.freeRectangles.push(mergedRect);

              foundMerge = true;
              mergesMade++;
              break;
            }
          }
        }

        if (foundMerge) break;
      }

      if (!foundMerge) break;
    }

    // Only log if we actually made merges or started with many rectangles
    if (mergesMade > 0 || (shouldLog && this.freeRectangles.length > 2)) {
      console.log(
        `⚡ Aggressive merge: ${mergesMade} merges in ${iterations} iterations`
      );
    }
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

  console.log(`\n🎯 === STARTING HIERARCHICAL LAYOUT ===`);
  console.log(`Viewport: ${viewportWidth} x ${viewportHeight}`);
  console.log(`Options:`, options);

  const layoutRoot = layoutNodeRecursive(
    rootNode,
    { x: 0, y: 0, w: viewportWidth, h: viewportHeight },
    options,
    0, // depth
    undefined // parent
  );

  // Add overlap detection and logging
  console.log(`\n🔍 === CHECKING FOR OVERLAPS ===`);
  if (layoutRoot) {
    const allNodes = collectAllLayoutNodes(layoutRoot);
    const overlaps = detectOverlaps(allNodes);

    if (overlaps.length > 0) {
      console.error(`❌ FOUND ${overlaps.length} OVERLAPPING PAIRS:`);

      // Apply overlap corrections
      console.log(`\n🔧 === APPLYING OVERLAP CORRECTIONS ===`);
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
          const oldY = nodeToMove.y;
          nodeToMove.y += requiredYMove;
          correctionsMade++;

          console.log(
            `🔧 CORRECTED: "${nodeToMove.node.label || nodeToMove.node.id}" moved from Y=${oldY.toFixed(1)} to Y=${nodeToMove.y.toFixed(1)} (+${requiredYMove.toFixed(1)})`
          );

          // Also adjust any children's positions accordingly
          if (nodeToMove.children) {
            adjustChildrenPositions(nodeToMove, 0, requiredYMove);
          }
        }
      }

      if (correctionsMade > 0) {
        console.log(`✅ Applied ${correctionsMade} overlap corrections`);

        // Re-check for any remaining overlaps
        const remainingOverlaps = detectOverlaps(
          collectAllLayoutNodes(layoutRoot)
        );
        if (remainingOverlaps.length > 0) {
          console.warn(
            `⚠️ ${remainingOverlaps.length} overlaps still remain after corrections`
          );
        } else {
          console.log(`✅ All overlaps successfully resolved`);
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
  const nodeLabel = node.label || node.id;
  console.log(
    `📐 [${depth}] LAYOUT START: "${nodeLabel}" in space [${parentAllocatedSpace.x.toFixed(1)}, ${parentAllocatedSpace.y.toFixed(1)}, ${parentAllocatedSpace.w.toFixed(1)}x${parentAllocatedSpace.h.toFixed(1)}]`
  );

  if (parentAllocatedSpace.w <= 0 || parentAllocatedSpace.h <= 0) {
    console.log(`❌ [${depth}] SKIPPED: "${nodeLabel}" - zero area`);
    return null;
  }
  if (
    isNaN(parentAllocatedSpace.w) ||
    isNaN(parentAllocatedSpace.h) ||
    isNaN(parentAllocatedSpace.x) ||
    isNaN(parentAllocatedSpace.y)
  ) {
    console.log(`❌ [${depth}] SKIPPED: "${nodeLabel}" - invalid coordinates`);
    return null;
  }

  const isEffectivelyLeaf = !node.children || node.children.length === 0;

  // For containers with very small allocated space, render as simple box instead of skipping
  if (
    !isEffectivelyLeaf &&
    (parentAllocatedSpace.w < options.leafMinWidth ||
      parentAllocatedSpace.h < options.leafMinHeight)
  ) {
    console.log(`📦 [${depth}] SMALL CONTAINER: "${nodeLabel}" -> box mode`);
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
    console.log(`🍃 [${depth}] LEAF: "${nodeLabel}" processing`);
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

    console.log(
      `✅ [${depth}] LEAF DONE: "${nodeLabel}" -> [${currentLayoutNode.x.toFixed(1)}, ${currentLayoutNode.y.toFixed(1)}, ${currentLayoutNode.w.toFixed(1)}x${currentLayoutNode.h.toFixed(1)}]`
    );
  } else {
    // --- Handle Container Node ---
    console.log(
      `📁 [${depth}] CONTAINER: "${nodeLabel}" with ${node.children?.length || 0} children`
    );
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

    console.log(
      `📦 [${depth}] PACKING AREA: [${contentPackingArea.x}, ${contentPackingArea.y}, ${contentPackingArea.w.toFixed(1)}x${contentPackingArea.h.toFixed(1)}] (header: ${headerActualHeight}, padding: ${options.padding})`
    );
    console.log(
      `🌍 [${depth}] CONTAINER ABSOLUTE POSITION: [${parentAllocatedSpace.x.toFixed(1)}, ${parentAllocatedSpace.y.toFixed(1)}] for coordinate reference`
    );

    if (contentPackingArea.w <= 0 || contentPackingArea.h <= 0) {
      // Not enough space for content, render as box without children
      console.log(`❌ [${depth}] NO PACKING SPACE: "${nodeLabel}" -> box mode`);

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

      console.log(
        `📏 [${depth}] CHILD SIZE: "${childNode.label || childNode.id}" -> ${childTargetW.toFixed(1)}x${childTargetH.toFixed(1)} (${isChildContainer ? "container" : "leaf"})`
      );
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
      const childLabel = childNode.label || childNode.id;

      console.log(
        `🎯 [${depth}] PACKING: "${childLabel}" size ${packerInput.targetW.toFixed(1)}x${packerInput.targetH.toFixed(1)}`
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

        console.log(
          `📍 [${depth}] PLACEMENT: "${childLabel}" at packer coords [${placement.x.toFixed(1)}, ${placement.y.toFixed(1)}] -> absolute [${allocatedCellForChild.x.toFixed(1)}, ${allocatedCellForChild.y.toFixed(1)}, ${allocatedCellForChild.w.toFixed(1)}x${allocatedCellForChild.h.toFixed(1)}]`
        );
        console.log(
          `🔄 [${depth}] COORDINATE TRANSFORM: parent=[${parentAllocatedSpace.x.toFixed(1)}, ${parentAllocatedSpace.y.toFixed(1)}] + padding=${options.padding} + header=${headerActualHeight} + packer=[${placement.x.toFixed(1)}, ${placement.y.toFixed(1)}]`
        );

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

            console.log(
              `✅ [${depth}] CHILD PLACED: "${childLabel}" final [${laidOutChild.x.toFixed(1)}, ${laidOutChild.y.toFixed(1)}, ${laidOutChild.w.toFixed(1)}x${laidOutChild.h.toFixed(1)}]`
            );

            // Enhanced Dynamic Container Resizing: Handle both container AND leaf children that use less space
            // Calculate differences using the SAME coordinate system - absolute coordinates first for logging
            const absoluteHeightDiff = placement.h - laidOutChild.h;
            const absoluteWidthDiff = placement.w - laidOutChild.w;

            if (absoluteHeightDiff > 0 || absoluteWidthDiff > 0) {
              console.log(
                `🔄 [${depth}] SPACE RECLAIM: "${childLabel}" freed ${absoluteWidthDiff.toFixed(1)}w x ${absoluteHeightDiff.toFixed(1)}h`
              );
              console.log(
                `🔍 [${depth}] RECLAIM CONTEXT: allocated=[${placement.x.toFixed(1)}, ${placement.y.toFixed(1)}, ${placement.w.toFixed(1)}x${placement.h.toFixed(1)}] actual=[${laidOutChild.x.toFixed(1)}, ${laidOutChild.y.toFixed(1)}, ${laidOutChild.w.toFixed(1)}x${laidOutChild.h.toFixed(1)}]`
              );

              // CRITICAL FIX: Only reclaim significant amounts of space and use strict validation
              const minReclaimableWidth = options.leafMinWidth * 0.8;
              const minReclaimableHeight = options.leafMinHeight * 0.8;

              // Only proceed if the freed space is significant enough to be useful
              if (
                absoluteWidthDiff >= minReclaimableWidth ||
                absoluteHeightDiff >= minReclaimableHeight
              ) {
                // Update the packer's state to reflect the actual space used
                const packerInstance = (packer as any).packer;
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
                    };

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
                        console.log(
                          `🆓 [${depth}] RIGHT RECT (packer coords): [${rightRect.x.toFixed(1)}, ${rightRect.y.toFixed(1)}, ${rightRect.w.toFixed(1)}x${rightRect.h.toFixed(1)}]`
                        );
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
                        console.log(
                          `🆓 [${depth}] BOTTOM RECT (packer coords): [${bottomRect.x.toFixed(1)}, ${bottomRect.y.toFixed(1)}, ${bottomRect.w.toFixed(1)}x${bottomRect.h.toFixed(1)}]`
                        );
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
                            console.log(
                              `⚠️ [${depth}] OVERLAP PREVENTION: Free rect [${unusedRect.x.toFixed(1)}, ${unusedRect.y.toFixed(1)}, ${unusedRect.w.toFixed(1)}x${unusedRect.h.toFixed(1)}] overlaps with "${existingItem.id}" [${existingItem.x.toFixed(1)}, ${existingItem.y.toFixed(1)}, ${existingItem.w.toFixed(1)}x${existingItem.h.toFixed(1)}] - REJECTING`
                            );
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
                              console.log(
                                `⚠️ [${depth}] DUPLICATE PREVENTION: Free rect [${unusedRect.x.toFixed(1)}, ${unusedRect.y.toFixed(1)}, ${unusedRect.w.toFixed(1)}x${unusedRect.h.toFixed(1)}] overlaps with existing free rect - REJECTING`
                              );
                              break;
                            }
                          }

                          if (!duplicatesExistingFree) {
                            packer.addFreeRectangle(unusedRect);
                            console.log(
                              `✅ [${depth}] RECT RECLAIMED (packer coords): [${unusedRect.x.toFixed(1)}, ${unusedRect.y.toFixed(1)}, ${unusedRect.w.toFixed(1)}x${unusedRect.h.toFixed(1)}] (area: ${rectArea.toFixed(1)})`
                            );
                          }
                        }
                      } else {
                        console.log(
                          `❌ [${depth}] RECT IGNORED: [${unusedRect.x.toFixed(1)}, ${unusedRect.y.toFixed(1)}, ${unusedRect.w.toFixed(1)}x${unusedRect.h.toFixed(1)}] (area: ${rectArea.toFixed(1)}, too small)`
                        );
                      }
                    }
                  }
                }
              } else {
                console.log(
                  `❌ [${depth}] SPACE RECLAIM SKIPPED: differences too small (w: ${absoluteWidthDiff.toFixed(1)}, h: ${absoluteHeightDiff.toFixed(1)})`
                );
              }
            }
          } else {
            console.log(
              `❌ [${depth}] CHILD FAILED: "${childLabel}" - recursive layout returned null`
            );
            // Log when recursive layout returned null (child was skipped internally)
          }
        } else {
          console.log(
            `❌ [${depth}] CHILD SKIPPED: "${childLabel}" - negative dimensions after bounds check`
          );
        }
      } else {
        console.log(
          `🔍 [${depth}] PACKER FAILED: "${childLabel}" - trying adaptive placement`
        );

        // Try to fit the item by adapting its dimensions to available space

        // Get the free rectangles from the packer to find actual available spaces
        let bestFitRect: FreeRectangle | null = null;
        let bestFitArea = 0;
        let bestFitScore = 0; // New scoring system
        let bestFitW = 0;
        let bestFitH = 0;

        // Access free rectangles from the underlying Guillotine2DPacker
        const freeRects = (packer as any).packer?.freeRectangles || [];

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
              bestFitArea = area;
              bestFitRect = rect;
              bestFitW = fitW;
              bestFitH = fitH;
            }
          }
        }

        if (bestFitRect) {
          console.log(
            `🎯 [${depth}] ADAPTIVE FIT: "${childLabel}" -> [${bestFitRect.x.toFixed(1)}, ${bestFitRect.y.toFixed(1)}] size ${bestFitW.toFixed(1)}x${bestFitH.toFixed(1)}`
          );

          // Additional validation before placing: ensure the placement won't exceed container bounds
          const wouldExceedWidth =
            bestFitRect.x + bestFitW > contentPackingArea.w;
          const wouldExceedHeight =
            bestFitRect.y + bestFitH > contentPackingArea.h;

          if (wouldExceedWidth || wouldExceedHeight) {
            console.log(
              `❌ [${depth}] ADAPTIVE FIT REJECTED: "${childLabel}" would exceed container bounds`
            );
            console.log(
              `   Container: [0, 0, ${contentPackingArea.w.toFixed(1)}x${contentPackingArea.h.toFixed(1)}]`
            );
            console.log(
              `   Proposed: [${bestFitRect.x.toFixed(1)}, ${bestFitRect.y.toFixed(1)}, ${bestFitW.toFixed(1)}x${bestFitH.toFixed(1)}]`
            );
          } else {
            // Check one more time for overlaps with existing packed items
            const packerInstance = (packer as any).packer;
            let hasOverlapWithPacked = false;

            if (packerInstance && packerInstance.packedItems) {
              const existingItems = packerInstance.packedItems || [];

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
                  console.log(
                    `❌ [${depth}] ADAPTIVE FIT REJECTED: "${childLabel}" would overlap with "${existingItem.id}"`
                  );
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

                console.log(
                  `✅ [${depth}] ADAPTIVE CHILD PLACED: "${childLabel}" final [${laidOutChild.x.toFixed(1)}, ${laidOutChild.y.toFixed(1)}, ${laidOutChild.w.toFixed(1)}x${laidOutChild.h.toFixed(1)}]`
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
              }
            }
          }
        } else {
          console.log(
            `❌ [${depth}] NO ADAPTIVE FIT: "${childLabel}" - no suitable free rectangles found`
          );
        }
      }
    }

    // Debug: Show 2D packing visualization
    if (typeof packer.logPackingVisualization === "function") {
      packer.logPackingVisualization(`${node.label || "Container"}-${node.id}`);
    }

    // COLLECT FREE RECTANGLES FOR DEBUGGING VISUALIZATION
    const packerInstance = (packer as any).packer;
    if (packerInstance && packerInstance.freeRectangles) {
      const freeRects = packerInstance.freeRectangles.map(
        (rect: FreeRectangle) => ({
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
        })
      );

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

    const originalHeight = currentLayoutNode.h;
    currentLayoutNode.w = parentAllocatedSpace.w; // Typically takes full allocated width
    currentLayoutNode.h = Math.min(
      parentAllocatedSpace.h,
      headerActualHeight +
        actualContentHeight +
        (actualContentHeight > 0 ? options.padding * 2 : options.padding) // top padding is part of contentPackingArea.y
    );

    console.log(
      `📐 [${depth}] CONTAINER HEIGHT ADJUST: "${nodeLabel}" ${originalHeight.toFixed(1)} -> ${currentLayoutNode.h.toFixed(1)} (content: ${actualContentHeight.toFixed(1)}, header: ${headerActualHeight})`
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
      console.log(
        `📦 [${depth}] EMPTY CONTAINER: "${nodeLabel}" -> header only (${headerActualHeight})`
      );
    }

    console.log(
      `✅ [${depth}] CONTAINER DONE: "${nodeLabel}" -> [${currentLayoutNode.x.toFixed(1)}, ${currentLayoutNode.y.toFixed(1)}, ${currentLayoutNode.w.toFixed(1)}x${currentLayoutNode.h.toFixed(1)}] with ${currentLayoutNode.children?.length || 0} children`
    );
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
    console.error(
      `🚨 [${depth}] INVALID COORDINATES: "${nodeLabel}" [${currentLayoutNode.x}, ${currentLayoutNode.y}, ${currentLayoutNode.w}x${currentLayoutNode.h}]`
    );
    // Provide default values to prevent SVG errors, though layout will be wrong.
    currentLayoutNode.x = currentLayoutNode.x || 0;
    currentLayoutNode.y = currentLayoutNode.y || 0;
    currentLayoutNode.w = currentLayoutNode.w || options.leafMinWidth;
    currentLayoutNode.h = currentLayoutNode.h || options.leafMinHeight;
  }

  return currentLayoutNode;
}
