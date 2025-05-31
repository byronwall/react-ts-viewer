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
    optimalCharWidth?: number;
    minCharWidth?: number;
    maxCharWidth?: number;
    headerHeight?: number;
    fontSize?: number;
    minFontSize?: number;
    padding?: number;
  }
) => LayoutNode;

export const binaryLayout: LayoutFn = (root, w, h, opts = {}) => {
  const {
    sizeAccessor = (n) => n.value,
    minNodeSize = 20,
    optimalCharWidth = 8,
    minCharWidth = 6,
    maxCharWidth = 12,
    headerHeight = 32,
    fontSize = 11,
    minFontSize = 12,
    padding = 4,
  } = opts;

  // Calculate pixel width needed for character count
  const getPixelWidthForChars = (charCount: number): number => {
    // Use more aggressive character width to encourage narrower nodes
    return charCount * fontSize * 0.4; // Reduced from 0.5 to 0.4
  };

  const optimalWidth = getPixelWidthForChars(optimalCharWidth);
  const minWidth = getPixelWidthForChars(minCharWidth);
  const maxWidth = getPixelWidthForChars(maxCharWidth);

  // Header height calculation that matches the renderer
  const getHeaderHeight = (depth: number, availableHeight: number): number => {
    const maxHeaderHeight = 28; // Increased from 24
    const minHeaderHeight = Math.max(16, (minFontSize || 12) + 8); // Base on minFontSize

    // Same logic as in TreemapSVG but with larger base values
    const depthFactor = Math.max(0.85, 1 - depth * 0.03); // Less aggressive scaling
    const baseHeight = Math.max(minHeaderHeight, maxHeaderHeight * depthFactor);

    const maxAllowedHeight = Math.max(
      baseHeight,
      Math.min(availableHeight * 0.4, baseHeight * 1.3)
    );

    return maxAllowedHeight;
  };

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

    // Use the same header height calculation as the renderer
    const hasRenderableChildren = node.children.some(
      (child) => child && sizeAccessor(child) > 0
    );
    const shouldRenderHeader =
      hasRenderableChildren && height >= 16 && width >= 24;
    const reservedHeaderHeight = shouldRenderHeader
      ? getHeaderHeight(depth, height)
      : 0;

    // Apply padding to reduce available space for children
    const paddingToApply = depth > 0 ? padding : 0; // Don't apply padding to root node
    const availableWidth = width - 2 * paddingToApply;
    const availableHeight = height - reservedHeaderHeight - 2 * paddingToApply;

    if (availableWidth < minWidth || availableHeight < minNodeSize) {
      return layoutNode;
    }

    // Filter viable children
    const viableChildren = node.children.filter((child) => {
      const childValue = sizeAccessor(child);
      return childValue > 0;
    });

    if (viableChildren.length === 0) {
      return layoutNode;
    }

    const totalValue = viableChildren.reduce(
      (sum, child) => sum + sizeAccessor(child),
      0
    );
    if (totalValue === 0) {
      return layoutNode;
    }

    // GRID-BASED LAYOUT LOGIC
    // Offset start position by padding
    const startX = x + paddingToApply;
    const startY = y + reservedHeaderHeight + paddingToApply;

    // Determine optimal grid layout
    const layoutResult = calculateGridLayout(
      viableChildren,
      totalValue,
      availableWidth,
      availableHeight,
      sizeAccessor,
      optimalWidth,
      maxWidth,
      minWidth,
      minNodeSize,
      depth
    );

    // Apply the calculated layout
    for (const childLayout of layoutResult) {
      if (!childLayout || !childLayout.child) continue;

      const childLayoutNode = layoutRecursive(
        childLayout.child,
        startX + childLayout.x,
        startY + childLayout.y,
        childLayout.w,
        childLayout.h,
        depth + 1
      );

      layoutNode.children!.push(childLayoutNode);
    }

    return layoutNode;
  }

  // Grid layout calculation function
  function calculateGridLayout(
    children: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    sizeAccessor: (n: ScopeNode) => number,
    optimalWidth: number,
    maxWidth: number,
    minWidth: number,
    minNodeSize: number,
    depth: number
  ): Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }> {
    // Calculate how many columns we can fit at optimal width
    const optimalColumns = Math.floor(availableWidth / optimalWidth);

    // Be more aggressive about trying multi-column layouts
    const maxPossibleColumns = Math.floor(availableWidth / minWidth);

    // Try different column counts to find the best layout
    const layouts: Array<
      Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }>
    > = [];

    // Always try horizontal layout first for multiple children, not just when very wide
    if (children.length >= 2 && availableWidth > optimalWidth * 1.5) {
      const horizontalLayout = createHorizontalLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        maxWidth
      );
      if (horizontalLayout.length > 0) {
        layouts.push(horizontalLayout);
      }
    }

    // Try 2 columns if we have space and children
    if (maxPossibleColumns >= 2 && children.length >= 2) {
      const grid2Layout = createGridLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        2,
        minNodeSize
      );
      if (grid2Layout.length > 0) {
        layouts.push(grid2Layout);
      }
    }

    // Try 3 columns if we have space and children
    if (maxPossibleColumns >= 3 && children.length >= 3) {
      const grid3Layout = createGridLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        3,
        minNodeSize
      );
      if (grid3Layout.length > 0) {
        layouts.push(grid3Layout);
      }
    }

    // Try 4 columns if we have space and children
    if (maxPossibleColumns >= 4 && children.length >= 4) {
      const grid4Layout = createGridLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        4,
        minNodeSize
      );
      if (grid4Layout.length > 0) {
        layouts.push(grid4Layout);
      }
    }

    // Try even more columns if we have many children and space
    if (maxPossibleColumns >= 5 && children.length >= 5) {
      const grid5Layout = createGridLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        5,
        minNodeSize
      );
      if (grid5Layout.length > 0) {
        layouts.push(grid5Layout);
      }
    }

    if (maxPossibleColumns >= 6 && children.length >= 6) {
      const grid6Layout = createGridLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        6,
        minNodeSize
      );
      if (grid6Layout.length > 0) {
        layouts.push(grid6Layout);
      }
    }

    // Try 1 column (vertical stack) - now later in priority
    const verticalLayout = createVerticalLayout(
      children,
      totalValue,
      availableWidth,
      availableHeight,
      sizeAccessor,
      minNodeSize
    );
    if (verticalLayout.length > 0) {
      layouts.push(verticalLayout);
    }

    // Score each layout and pick the best one
    const bestLayout = pickBestLayout(
      layouts,
      optimalWidth,
      availableWidth,
      availableHeight
    );
    return bestLayout || []; // Ensure we always return an array
  }

  function createVerticalLayout(
    children: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    sizeAccessor: (n: ScopeNode) => number,
    minNodeSize: number
  ): Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }> {
    const result: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];
    let currentY = 0;

    for (const child of children) {
      if (!child) continue; // Guard against undefined

      const childValue = sizeAccessor(child);
      const ratio = childValue / totalValue;
      const childH = Math.max(minNodeSize, availableHeight * ratio);

      if (currentY + childH > availableHeight) {
        break;
      }

      result.push({
        child,
        x: 0,
        y: currentY,
        w: availableWidth,
        h: childH,
      });

      currentY += childH;
    }

    return result;
  }

  function createHorizontalLayout(
    children: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    sizeAccessor: (n: ScopeNode) => number,
    maxWidth: number
  ): Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }> {
    const result: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];
    let currentX = 0;

    // Calculate maximum width any single child should take
    const maxChildWidth = Math.min(
      maxWidth,
      availableWidth / Math.max(1, children.length * 0.7)
    );

    for (const child of children) {
      if (!child) continue; // Guard against undefined

      const childValue = sizeAccessor(child);
      const ratio = childValue / totalValue;
      let childW = availableWidth * ratio;

      // Constrain to reasonable width - be more aggressive
      childW = Math.min(childW, maxChildWidth);

      // Ensure minimum width but cap it
      childW = Math.max(childW, Math.min(80, availableWidth / children.length));

      if (currentX + childW > availableWidth) {
        break;
      }

      result.push({
        child,
        x: currentX,
        y: 0,
        w: childW,
        h: availableHeight,
      });

      currentX += childW;
    }

    return result;
  }

  function createGridLayout(
    children: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    sizeAccessor: (n: ScopeNode) => number,
    columns: number,
    minNodeSize: number
  ): Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }> {
    const result: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];
    const columnWidth = availableWidth / columns;

    // Sort children by size for better packing - filter out undefined values
    const sortedChildren = children
      .filter((child): child is ScopeNode => child !== undefined)
      .sort((a, b) => sizeAccessor(b) - sizeAccessor(a));

    // Calculate row heights based on the largest items in each row
    const rows = Math.ceil(sortedChildren.length / columns);
    const rowHeights: number[] = [];

    for (let row = 0; row < rows; row++) {
      const rowChildren = sortedChildren.slice(
        row * columns,
        (row + 1) * columns
      );
      const rowTotalValue = rowChildren.reduce(
        (sum, child) => sum + sizeAccessor(child),
        0
      );
      const rowRatio = rowTotalValue / totalValue;
      const baseRowHeight = availableHeight * rowRatio;

      rowHeights.push(Math.max(minNodeSize, baseRowHeight));
    }

    // Normalize row heights to fit available space
    const totalRowHeight = rowHeights.reduce((sum, h) => sum + h, 0);
    if (totalRowHeight > availableHeight) {
      const scale = availableHeight / totalRowHeight;
      for (let i = 0; i < rowHeights.length; i++) {
        const currentHeight = rowHeights[i];
        if (currentHeight !== undefined) {
          rowHeights[i] = Math.max(minNodeSize, currentHeight * scale);
        }
      }
    }

    // Place children in grid
    let currentY = 0;
    for (let row = 0; row < rows; row++) {
      const rowChildren = sortedChildren.slice(
        row * columns,
        (row + 1) * columns
      );
      const rowHeight = rowHeights[row];

      if (rowHeight === undefined) continue; // Guard against undefined

      for (let col = 0; col < rowChildren.length; col++) {
        const child = rowChildren[col];
        if (!child) continue; // Guard against undefined

        result.push({
          child,
          x: col * columnWidth,
          y: currentY,
          w: columnWidth,
          h: rowHeight,
        });
      }

      currentY += rowHeight;
    }

    return result;
  }

  function pickBestLayout(
    layouts: Array<
      Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }>
    >,
    optimalWidth: number,
    availableWidth: number,
    availableHeight: number
  ):
    | Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }>
    | undefined {
    if (layouts.length === 0) return undefined;

    let bestLayout = layouts[0];
    if (!bestLayout) return undefined;

    let bestScore = scoreLayout(
      bestLayout,
      optimalWidth,
      availableWidth,
      availableHeight
    );

    for (let i = 1; i < layouts.length; i++) {
      const layout = layouts[i];
      if (!layout) continue;

      const score = scoreLayout(
        layout,
        optimalWidth,
        availableWidth,
        availableHeight
      );
      if (score > bestScore) {
        bestScore = score;
        bestLayout = layout;
      }
    }

    return bestLayout;
  }

  function scoreLayout(
    layout: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }>,
    optimalWidth: number,
    availableWidth: number,
    availableHeight: number
  ) {
    if (layout.length === 0) return 0;

    let score = 0;
    let totalArea = 0;
    let widthPenalty = 0;

    for (const item of layout) {
      const area = item.w * item.h;
      totalArea += area;

      // Calculate complexity of this child group
      const descendantCount = getDescendantCount(item.child);
      const maxDepth = getMaxDepth(item.child);
      const complexity = Math.log(descendantCount + 1) * (maxDepth + 1);

      // Weight by complexity - more complex groups should get more space
      const complexityWeight = Math.max(1, complexity / 5);

      // Strongly prefer widths close to optimal, penalize very wide nodes
      const widthRatio = item.w / optimalWidth;
      let widthScore;
      if (widthRatio <= 1.5) {
        // Good width range
        widthScore = 1.0;
      } else if (widthRatio <= 3) {
        // Acceptable but not great
        widthScore = 0.7;
      } else if (widthRatio <= 5) {
        // Too wide, penalize
        widthScore = 0.3;
      } else {
        // Very wide, heavily penalize
        widthScore = 0.1;
      }

      score += widthScore * area * complexityWeight;

      // Add penalty for very wide nodes relative to available width
      if (item.w > availableWidth * 0.6) {
        widthPenalty += area * 0.5; // Heavy penalty for nodes using >60% of width
      }

      // Prefer reasonable aspect ratios (not too wide or too tall)
      const aspectRatio = item.w / item.h;
      let aspectScore;
      if (aspectRatio >= 0.5 && aspectRatio <= 2) {
        aspectScore = 1.0; // Ideal aspect ratio
      } else if (aspectRatio >= 0.3 && aspectRatio <= 4) {
        aspectScore = 0.7; // Acceptable
      } else {
        aspectScore = 0.3; // Poor aspect ratio
      }
      score += aspectScore * area * complexityWeight;

      // Bonus for layouts with multiple items (encourages splitting)
      if (layout.length > 1) {
        score += area * 0.2 * complexityWeight;
      }
    }

    // Apply width penalty
    score -= widthPenalty;

    // Prefer layouts that use more of the available space, but not as heavily weighted
    const spaceUtilization = totalArea / (availableWidth * availableHeight);
    score *= Math.sqrt(spaceUtilization); // Less aggressive space utilization bonus

    // Bonus for having multiple items (encourages multi-column layouts)
    if (layout.length > 1) {
      score *= 1.2; // 20% bonus for multi-item layouts
    }
    if (layout.length > 2) {
      score *= 1.1; // Additional 10% bonus for 3+ items
    }

    return score;
  }

  // Helper function to count all descendants
  function getDescendantCount(node: ScopeNode): number {
    if (!node.children || node.children.length === 0) {
      return 1;
    }

    return node.children.reduce((count, child) => {
      if (!child) return count;
      return count + getDescendantCount(child);
    }, 1);
  }

  // Helper function to get maximum depth
  function getMaxDepth(node: ScopeNode): number {
    if (!node.children || node.children.length === 0) {
      return 0;
    }

    const childDepths = node.children.map((child) => {
      if (!child) return 0;
      return getMaxDepth(child);
    });

    return 1 + Math.max(...childDepths.filter((d) => d !== undefined));
  }

  return layoutRecursive(root, 0, 0, w, h, 0);
};
