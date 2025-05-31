import type { ScopeNode } from "../../types";

export interface LayoutNode {
  node: ScopeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  children?: LayoutNode[];
}

export type LayoutFn = (
  root: ScopeNode,
  w: number,
  h: number,
  opts?: {
    aspectTarget?: number;
    sizeAccessor?: (n: ScopeNode) => number;
    minNodeSize?: number;
  }
) => LayoutNode;

export const binaryLayout: LayoutFn = (root, w, h, opts = {}) => {
  const {
    aspectTarget = 1.0,
    sizeAccessor = (n) => n.value,
    minNodeSize = 4,
  } = opts;

  function layoutRecursive(
    node: ScopeNode,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number
  ): LayoutNode {
    const layoutNode: LayoutNode = {
      node,
      x,
      y,
      w: width,
      h: height,
      children: [],
    };

    if (!node.children || node.children.length === 0) {
      return layoutNode;
    }

    // Filter out children that would be too small to render meaningfully
    const viableChildren = node.children.filter((child) => {
      const childValue = sizeAccessor(child);
      return childValue > 0;
    });

    if (viableChildren.length === 0) {
      return layoutNode;
    }

    // Calculate total value of viable children
    const totalValue = viableChildren.reduce(
      (sum, child) => sum + sizeAccessor(child),
      0
    );

    if (totalValue === 0) {
      return layoutNode;
    }

    // Improved split direction logic based on aspect ratio and depth
    const currentAspectRatio = width / height;

    // Enhanced logic to prevent extremely wide or tall rectangles
    const maxAspectRatio = 4.0; // Don't allow rectangles wider than 4:1
    const minAspectRatio = 0.25; // Don't allow rectangles taller than 4:1

    // Adjust split decision based on current aspect ratio constraints
    let isHorizontalSplit = currentAspectRatio > aspectTarget;

    // Force vertical split if we're getting too wide
    if (currentAspectRatio > maxAspectRatio) {
      isHorizontalSplit = false;
    }
    // Force horizontal split if we're getting too tall
    else if (currentAspectRatio < minAspectRatio) {
      isHorizontalSplit = true;
    }

    // For deeper levels, prefer splits that maintain better aspect ratios
    const depthFactor = Math.min(1, depth * 0.05); // Reduced from 0.1 to 0.05 for less aggressive changes
    const adjustedAspectTarget = aspectTarget + depthFactor;

    let currentPos = isHorizontalSplit ? x : y;
    const maxPos = isHorizontalSplit ? x + width : y + height;

    for (const child of viableChildren) {
      const childValue = sizeAccessor(child);
      const ratio = childValue / totalValue;

      let childX: number, childY: number, childW: number, childH: number;

      if (isHorizontalSplit) {
        // Split horizontally (side by side)
        childW = width * ratio;
        childH = height;
        childX = currentPos;
        childY = y;
        currentPos += childW;
      } else {
        // Split vertically (top to bottom)
        childW = width;
        childH = height * ratio;
        childX = x;
        childY = currentPos;
        currentPos += childH;
      }

      // Ensure we don't exceed bounds due to floating point precision
      if (currentPos > maxPos) {
        if (isHorizontalSplit) {
          childW = Math.max(minNodeSize, maxPos - childX);
        } else {
          childH = Math.max(minNodeSize, maxPos - childY);
        }
        // Update currentPos to prevent further overflow
        currentPos = maxPos;
      }

      // Ensure minimum size constraints with better aspect ratio consideration
      childW = Math.max(minNodeSize, childW);
      childH = Math.max(minNodeSize, childH);

      // Enforce reasonable aspect ratios for individual nodes
      const childAspectRatio = childW / childH;
      if (childAspectRatio > maxAspectRatio) {
        // Too wide - increase height proportionally
        const targetHeight = childW / maxAspectRatio;
        if (targetHeight <= height) {
          childH = Math.max(childH, targetHeight);
        }
      } else if (childAspectRatio < minAspectRatio) {
        // Too tall - increase width proportionally
        const targetWidth = childH * minAspectRatio;
        if (targetWidth <= width) {
          childW = Math.max(childW, targetWidth);
        }
      }

      // Additional bounds checking to ensure child doesn't exceed parent bounds
      if (childX + childW > x + width) {
        childW = Math.max(minNodeSize, x + width - childX);
      }
      if (childY + childH > y + height) {
        childH = Math.max(minNodeSize, y + height - childY);
      }

      // Skip children that are still too small after adjustments
      if (childW < minNodeSize || childH < minNodeSize) {
        continue;
      }

      const childLayout = layoutRecursive(
        child,
        childX,
        childY,
        childW,
        childH,
        depth + 1
      );

      layoutNode.children!.push(childLayout);
    }

    return layoutNode;
  }

  return layoutRecursive(root, 0, 0, w, h, 0);
};
