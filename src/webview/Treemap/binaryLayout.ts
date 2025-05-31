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
    minWidthPx?: number;
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
    minWidthPx = 60,
  } = opts;

  // Calculate pixel width needed for character count
  const getPixelWidthForChars = (charCount: number): number => {
    // Use more aggressive character width to encourage narrower nodes
    return charCount * fontSize * 0.4; // Reduced from 0.5 to 0.4
  };

  const optimalWidth = getPixelWidthForChars(optimalCharWidth);
  const minWidth = Math.max(minWidthPx, getPixelWidthForChars(minCharWidth));
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
    // Add console log to verify source order is maintained
    if (node.children && node.children.length > 0) {
      console.log(
        `[LAYOUT ORDER] Node "${node.label}" has ${node.children.length} children:`,
        node.children.map((child, index) => ({
          index,
          label: child.label,
          id: child.id,
          startLine: child.loc?.start.line || "unknown",
        }))
      );
    }

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

    // Filter viable children - PRESERVE ORIGINAL ORDER
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

    // Always try proportional horizontal layout first for multiple children
    if (children.length >= 2) {
      const proportionalLayout = createProportionalLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        optimalWidth,
        maxWidth,
        minWidth,
        minNodeSize
      );
      if (proportionalLayout.length > 0) {
        layouts.push(proportionalLayout);
      }
    }

    // Try bin packing layout
    const binPackingLayout = createBinPackingLayout(
      children,
      totalValue,
      availableWidth,
      availableHeight,
      sizeAccessor,
      optimalWidth,
      minWidth,
      minNodeSize
    );
    if (binPackingLayout.length > 0) {
      layouts.push(binPackingLayout);
    }

    // Try 2 columns if we have space and children
    if (maxPossibleColumns >= 2 && children.length >= 2) {
      const grid2Layout = createFlexibleGridLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        2,
        minNodeSize,
        optimalWidth,
        minWidth
      );
      if (grid2Layout.length > 0) {
        layouts.push(grid2Layout);
      }
    }

    // Try 3 columns if we have space and children
    if (maxPossibleColumns >= 3 && children.length >= 3) {
      const grid3Layout = createFlexibleGridLayout(
        children,
        totalValue,
        availableWidth,
        availableHeight,
        sizeAccessor,
        3,
        minNodeSize,
        optimalWidth,
        minWidth
      );
      if (grid3Layout.length > 0) {
        layouts.push(grid3Layout);
      }
    }

    // Try 1 column (vertical stack) - now later in priority
    const verticalLayout = createVerticalLayout(
      children,
      totalValue,
      availableWidth,
      availableHeight,
      sizeAccessor,
      minNodeSize,
      minWidth
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

    if (bestLayout) {
      console.log(
        `[BEST LAYOUT] Selected layout with ${bestLayout.length} children. Final order:`,
        bestLayout.map((item, index) => ({
          index,
          label: item.child.label,
          startLine: item.child.loc?.start.line || "unknown",
          x: Math.round(item.x),
          y: Math.round(item.y),
          w: Math.round(item.w),
          h: Math.round(item.h),
          value: sizeAccessor(item.child),
        }))
      );
    }

    return bestLayout || []; // Ensure we always return an array
  }

  // New proportional layout that respects value-based sizing
  function createProportionalLayout(
    children: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    sizeAccessor: (n: ScopeNode) => number,
    optimalWidth: number,
    maxWidth: number,
    minWidth: number,
    minNodeSize: number
  ): Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }> {
    const result: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    console.log(
      `[PROPORTIONAL LAYOUT] Creating proportional layout for ${children.length} children:`,
      children.map((child, index) => ({
        index,
        label: child.label,
        value: sizeAccessor(child),
        ratio: sizeAccessor(child) / totalValue,
      }))
    );

    // Calculate ideal areas for each child
    const totalArea = availableWidth * availableHeight;
    const childData = children.map((child) => ({
      child,
      value: sizeAccessor(child),
      ratio: sizeAccessor(child) / totalValue,
      idealArea: (sizeAccessor(child) / totalValue) * totalArea,
    }));

    // Try to arrange children in a way that respects their proportional sizes
    // Start with a simple horizontal arrangement but with proportional widths
    let currentX = 0;

    for (const item of childData) {
      if (!item.child) continue;

      // Calculate width based on value proportion
      const proportionalWidth = item.ratio * availableWidth;

      // Apply constraints - ensure minimum width is respected
      let childW = Math.max(minWidth, Math.min(maxWidth, proportionalWidth));

      // Skip children that can't fit the minimum width
      const remainingWidth = availableWidth - currentX;
      if (childW > remainingWidth && remainingWidth < minWidth) {
        console.log(
          `[PROPORTIONAL LAYOUT] Skipping child "${item.child.label}" - insufficient width (${remainingWidth} < ${minWidth})`
        );
        continue; // Skip this child if it can't fit
      }

      if (childW > remainingWidth) {
        childW = remainingWidth;
      }

      if (currentX + childW > availableWidth) {
        break; // Stop if we can't fit more
      }

      result.push({
        child: item.child,
        x: currentX,
        y: 0,
        w: childW,
        h: availableHeight,
      });

      currentX += childW;
    }

    return result;
  }

  // New bin packing layout
  function createBinPackingLayout(
    children: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    sizeAccessor: (n: ScopeNode) => number,
    optimalWidth: number,
    minWidth: number,
    minNodeSize: number
  ): Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }> {
    const result: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    console.log(
      `[BIN PACKING LAYOUT] Creating bin packing layout for ${children.length} children:`,
      children.map((child, index) => ({
        index,
        label: child.label,
        value: sizeAccessor(child),
        ratio: sizeAccessor(child) / totalValue,
      }))
    );

    // Calculate target dimensions for each child based on their value
    const totalArea = availableWidth * availableHeight;
    const childrenWithDimensions = children
      .map((child) => {
        const value = sizeAccessor(child);
        const ratio = value / totalValue;
        const targetArea = ratio * totalArea;

        // Calculate target width and height maintaining reasonable aspect ratio
        // Prefer width close to optimal, adjust height accordingly
        let targetW = Math.min(
          optimalWidth * Math.sqrt(ratio * 4),
          availableWidth * 0.6
        );
        targetW = Math.max(minWidth, targetW);
        let targetH = Math.max(minNodeSize, targetArea / targetW);

        // Ensure height fits
        if (targetH > availableHeight) {
          targetH = availableHeight;
          targetW = Math.max(minWidth, targetArea / targetH);
        }

        return {
          child,
          value,
          ratio,
          targetArea,
          w: Math.min(targetW, availableWidth),
          h: Math.min(targetH, availableHeight),
        };
      })
      .filter((item) => item.w >= minWidth); // Filter out items that would be too narrow

    // Sort by area descending for better packing (largest first)
    const sortedChildren = [...childrenWithDimensions].sort(
      (a, b) => b.targetArea - a.targetArea
    );

    // Simple bin packing: place items left-to-right, top-to-bottom
    const placedRects: Array<{ x: number; y: number; w: number; h: number }> =
      [];

    for (const item of sortedChildren) {
      if (!item.child) continue;

      let placed = false;
      let bestX = 0;
      let bestY = 0;

      // Try to find the best position for this item
      for (
        let y = 0;
        y <= availableHeight - item.h && !placed;
        y += minNodeSize
      ) {
        for (
          let x = 0;
          x <= availableWidth - item.w && !placed;
          x += minWidth
        ) {
          // Check if this position conflicts with any existing rectangles
          const conflicts = placedRects.some(
            (rect) =>
              !(
                x >= rect.x + rect.w ||
                x + item.w <= rect.x ||
                y >= rect.y + rect.h ||
                y + item.h <= rect.y
              )
          );

          if (!conflicts) {
            bestX = x;
            bestY = y;
            placed = true;
          }
        }
      }

      if (placed) {
        result.push({
          child: item.child,
          x: bestX,
          y: bestY,
          w: item.w,
          h: item.h,
        });

        placedRects.push({
          x: bestX,
          y: bestY,
          w: item.w,
          h: item.h,
        });
      } else {
        console.log(
          `[BIN PACKING LAYOUT] Skipping child "${item.child.label}" - could not find suitable position`
        );
      }
    }

    // Restore original order for children that were placed
    const originalOrderResult = children
      .map((child) => result.find((r) => r.child.id === child.id))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);

    return originalOrderResult;
  }

  // Improved flexible grid layout with proportional column widths
  function createFlexibleGridLayout(
    children: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    sizeAccessor: (n: ScopeNode) => number,
    columns: number,
    minNodeSize: number,
    optimalWidth: number,
    minWidth: number
  ): Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }> {
    const result: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    // PRESERVE SOURCE ORDER - don't sort by size!
    const orderedChildren = children.filter(
      (child): child is ScopeNode => child !== undefined
    );

    console.log(
      `[FLEXIBLE GRID LAYOUT] Creating ${columns}-column flexible grid for ${orderedChildren.length} children in source order:`,
      orderedChildren.map((child, index) => ({
        index,
        label: child.label,
        startLine: child.loc?.start.line || "unknown",
        value: sizeAccessor(child),
      }))
    );

    const rows = Math.ceil(orderedChildren.length / columns);

    // Calculate column widths based on the total value in each column
    const columnTotalValues = new Array(columns).fill(0);
    for (let i = 0; i < orderedChildren.length; i++) {
      const col = i % columns;
      const child = orderedChildren[i];
      if (child) {
        columnTotalValues[col] += sizeAccessor(child);
      }
    }

    const totalColumnValue = columnTotalValues.reduce(
      (sum, val) => sum + val,
      0
    );
    const columnWidths = columnTotalValues.map((val) =>
      Math.max(
        minWidth,
        totalColumnValue > 0
          ? (val / totalColumnValue) * availableWidth
          : availableWidth / columns
      )
    );

    // Check if any column width is too narrow and adjust
    const totalRequiredWidth = columnWidths.reduce((sum, w) => sum + w, 0);
    if (totalRequiredWidth > availableWidth) {
      // Scale down proportionally if total width exceeds available space
      const scale = availableWidth / totalRequiredWidth;
      for (let i = 0; i < columnWidths.length; i++) {
        columnWidths[i] = Math.max(minWidth, (columnWidths[i] || 0) * scale);
      }
    }

    // Filter out columns that can't meet minimum width requirement
    const viableColumns = columnWidths.filter((w) => w >= minWidth).length;
    if (viableColumns === 0) {
      console.log(
        `[FLEXIBLE GRID LAYOUT] No columns can meet minimum width requirement (${minWidth}px)`
      );
      return [];
    }

    // Calculate row heights based on the items in each row
    const rowHeights: number[] = [];
    for (let row = 0; row < rows; row++) {
      const rowChildren = orderedChildren.slice(
        row * columns,
        (row + 1) * columns
      );
      const rowTotalValue = rowChildren.reduce(
        (sum, child) => sum + sizeAccessor(child),
        0
      );
      const rowRatio = totalValue > 0 ? rowTotalValue / totalValue : 1 / rows;
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

    // Place children in grid (in source order) with proportional column widths
    let currentY = 0;
    let columnStartX = 0;
    for (let col = 0; col < columns; col++) {
      const columnWidth = columnWidths[col];
      if (!columnWidth || columnWidth < minWidth) {
        console.log(
          `[FLEXIBLE GRID LAYOUT] Skipping column ${col} - width too narrow (${columnWidth} < ${minWidth})`
        );
        continue; // Skip columns that are too narrow
      }

      if (col > 0) {
        columnStartX += columnWidths[col - 1] || 0;
      }

      currentY = 0;
      for (let row = 0; row < rows; row++) {
        const childIndex = row * columns + col;
        if (childIndex >= orderedChildren.length) break;

        const child = orderedChildren[childIndex];
        const rowHeight = rowHeights[row];

        if (!child || rowHeight === undefined) continue;

        result.push({
          child,
          x: columnStartX,
          y: currentY,
          w: columnWidth,
          h: rowHeight,
        });

        currentY += rowHeight;
      }
    }

    return result;
  }

  function createVerticalLayout(
    children: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number,
    sizeAccessor: (n: ScopeNode) => number,
    minNodeSize: number,
    minWidth: number
  ): Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }> {
    const result: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    // Check if available width meets minimum requirement
    if (availableWidth < minWidth) {
      console.log(
        `[VERTICAL LAYOUT] Available width (${availableWidth}) is less than minimum (${minWidth}), skipping all children`
      );
      return result;
    }

    let currentY = 0;

    console.log(
      `[VERTICAL LAYOUT] Creating vertical stack for ${children.length} children in source order:`,
      children.map((child, index) => ({
        index,
        label: child.label,
        startLine: child.loc?.start.line || "unknown",
        value: sizeAccessor(child),
      }))
    );

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
