import {
  FreeRectangle,
  PackerPlacement,
  PackerInputItem,
} from "./layoutHierarchical";

export class Guillotine2DPacker {
  public freeRectangles: FreeRectangle[] = [];
  public packedItems: PackerPlacement[] = [];
  private interItemPadding: number;
  private maxWidth: number;
  private maxHeight: number;
  public usedWidth: number = 0;
  public usedHeight: number = 0;

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

  public splitRectangle(
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
  }
}
