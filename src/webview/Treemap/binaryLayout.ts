import type { ScopeNode } from "../../types";

export interface LayoutNode {
  node: ScopeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  children?: LayoutNode[];
  // Add metadata about layout decisions
  hasHiddenChildren?: boolean;
  hiddenChildrenCount?: number;
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
    optimalCharWidth = 12,
    minCharWidth = 8,
    maxCharWidth = 20,
    headerHeight = 32,
    fontSize = 11,
    minFontSize = 12,
    padding = 4,
    minWidthPx = 80,
  } = opts;

  // Calculate pixel width needed for character count
  const getPixelWidthForChars = (charCount: number): number => {
    // Use less aggressive character width to encourage wider nodes
    return charCount * fontSize * 0.5;
  };

  const optimalWidth = getPixelWidthForChars(optimalCharWidth);
  const minWidth = Math.max(minWidthPx, getPixelWidthForChars(minCharWidth));
  const maxWidth = getPixelWidthForChars(maxCharWidth);

  // Header height calculation that matches the renderer
  const getHeaderHeight = (depth: number, availableHeight: number): number => {
    const maxHeaderHeight = 28;
    const minHeaderHeight = Math.max(16, (minFontSize || 12) + 8);

    // Same logic as in TreemapSVG but with larger base values
    const depthFactor = Math.max(0.85, 1 - depth * 0.03);
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

    // Apply padding to reduce available space for children - NOW INCLUDES ROOT
    const paddingToApply = padding; // Remove depth check - apply to all nodes including root
    const availableWidth = width - 2 * paddingToApply;
    const availableHeight = height - reservedHeaderHeight - 2 * paddingToApply;

    if (availableWidth < minWidth || availableHeight < minNodeSize) {
      return layoutNode;
    }

    // Filter viable children - PRESERVE ORIGINAL ORDER
    const originalChildrenCount = node.children.length;
    const viableChildren = node.children.filter((child) => {
      const childValue = sizeAccessor(child);
      return childValue > 0;
    });

    // Track if any children were filtered out due to size constraints
    const filteredOutBySizeCount =
      originalChildrenCount - viableChildren.length;

    if (viableChildren.length === 0) {
      // All children were filtered out due to size constraints
      if (originalChildrenCount > 0) {
        layoutNode.hasHiddenChildren = true;
        layoutNode.hiddenChildrenCount = originalChildrenCount;

        // Add metadata to the node itself to track hidden children
        const updatedNode = { ...node };
        updatedNode.meta = {
          ...updatedNode.meta,
          hasHiddenChildren: true,
          hiddenChildrenCount: originalChildrenCount,
          hiddenReason: "size_constraints",
        };
        layoutNode.node = updatedNode;
      }
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
    let layoutResult: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }>;

    if (depth === 0) {
      // ROOT LEVEL: Always force reasonable grid layout - skip normal layouts entirely
      console.log(
        `[ROOT LAYOUT] Forcing aggressive grid layout for ${viableChildren.length} root children`
      );

      // Calculate reasonable grid dimensions
      const minCellWidth = 40; // Reasonable minimum for readability
      const minCellHeight = 30; // Reasonable minimum for readability
      const maxCellWidth = 200; // Don't let cells get too wide
      const maxCellHeight = 150; // Don't let cells get too tall

      // Find the best grid arrangement
      let bestArrangement: Array<{
        child: ScopeNode;
        x: number;
        y: number;
        w: number;
        h: number;
      }> = [];
      let bestScore = 0;

      // Try different column counts
      const maxCols = Math.min(
        Math.floor(availableWidth / minCellWidth),
        viableChildren.length
      );

      for (let cols = 1; cols <= maxCols; cols++) {
        const rows = Math.ceil(viableChildren.length / cols);
        const cellWidth = availableWidth / cols;
        const cellHeight = availableHeight / rows;

        // Skip if cells would be too small
        if (cellWidth < minCellWidth || cellHeight < minCellHeight) continue;

        // Calculate score based on reasonable aspect ratios
        const aspectRatio = cellWidth / cellHeight;
        const idealAspectRatio = 1.6; // Golden ratio-ish
        const aspectScore =
          1 / (1 + Math.abs(aspectRatio - idealAspectRatio) * 2);

        // Prefer arrangements that don't make cells too big
        const sizeScore =
          1 /
          (1 +
            Math.max(0, (cellWidth - maxCellWidth) / maxCellWidth) +
            Math.max(0, (cellHeight - maxCellHeight) / maxCellHeight));

        // Bonus for better space utilization
        const efficiency = viableChildren.length / (cols * rows);

        const totalScore = aspectScore * sizeScore * efficiency;

        if (totalScore > bestScore) {
          bestScore = totalScore;

          // Create this arrangement
          const arrangement: Array<{
            child: ScopeNode;
            x: number;
            y: number;
            w: number;
            h: number;
          }> = [];
          for (let i = 0; i < viableChildren.length; i++) {
            const child = viableChildren[i];
            if (!child) continue;

            const col = i % cols;
            const row = Math.floor(i / cols);

            arrangement.push({
              child,
              x: col * cellWidth,
              y: row * cellHeight,
              w: cellWidth,
              h: cellHeight,
            });
          }

          bestArrangement = arrangement;
        }
      }

      // Final fallback: horizontal arrangement if no good grid found
      if (bestArrangement.length === 0) {
        console.log(
          `[ROOT LAYOUT] No good grid found, using horizontal fallback`
        );
        const cellWidth = availableWidth / viableChildren.length;
        bestArrangement = viableChildren.map((child, i) => ({
          child,
          x: i * cellWidth,
          y: 0,
          w: cellWidth,
          h: availableHeight,
        }));
      }

      console.log(
        `[ROOT LAYOUT] Selected grid arrangement with score ${bestScore.toFixed(3)}`
      );
      layoutResult = bestArrangement;
    } else {
      // DEEPER LEVELS: Use normal layout with potential hiding
      layoutResult = calculateGridLayout(
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
    }

    // Track additional children filtered out by layout constraints (only for non-root)
    const layoutFilteredOutCount =
      depth === 0 ? 0 : viableChildren.length - layoutResult.length;
    const totalHiddenChildren = filteredOutBySizeCount + layoutFilteredOutCount;

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

    // Set hidden children metadata if any children were filtered out
    if (totalHiddenChildren > 0) {
      layoutNode.hasHiddenChildren = true;
      layoutNode.hiddenChildrenCount = totalHiddenChildren;

      // Add metadata to the node itself
      const updatedNode = { ...layoutNode.node };
      updatedNode.meta = {
        ...updatedNode.meta,
        hasHiddenChildren: true,
        hiddenChildrenCount: totalHiddenChildren,
        hiddenReason:
          filteredOutBySizeCount > 0 && layoutFilteredOutCount > 0
            ? "size_and_layout_constraints"
            : filteredOutBySizeCount > 0
              ? "size_constraints"
              : "layout_constraints",
      };
      layoutNode.node = updatedNode;
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

    // Be more aggressive about trying multi-column layouts for small nodes
    const maxPossibleColumns = Math.floor(availableWidth / minWidth);

    // Check if children are small and similar-sized (like imports)
    const childValues = children.map(sizeAccessor);
    const avgValue =
      childValues.reduce((sum, val) => sum + val, 0) / childValues.length;
    const maxValue = Math.max(...childValues);
    const minValue = Math.min(...childValues);
    const isUniformSized = maxValue <= minValue * 2;
    const isSmallNodes = avgValue <= 5;

    // Try different column counts to find the best layout
    const layouts: Array<
      Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }>
    > = [];

    // For uniform, small nodes (like imports), prioritize grid layouts over proportional
    if (isUniformSized && isSmallNodes && children.length >= 3) {
      // Try grid layouts first for small, uniform nodes
      for (let cols = Math.min(6, children.length); cols >= 2; cols--) {
        if (maxPossibleColumns >= cols) {
          const gridLayout = createFlexibleGridLayout(
            children,
            totalValue,
            availableWidth,
            availableHeight,
            sizeAccessor,
            cols,
            minNodeSize,
            optimalWidth,
            minWidth
          );
          if (gridLayout.length > 0) {
            layouts.push(gridLayout);
          }
        }
      }

      // Then try proportional horizontal layout
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
    } else {
      // For mixed-size or larger nodes, use original priority order
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

      // Try grid layouts for multiple columns
      for (let cols = Math.min(4, children.length); cols >= 2; cols--) {
        if (maxPossibleColumns >= cols && children.length >= cols) {
          const gridLayout = createFlexibleGridLayout(
            children,
            totalValue,
            availableWidth,
            availableHeight,
            sizeAccessor,
            cols,
            minNodeSize,
            optimalWidth,
            minWidth
          );
          if (gridLayout.length > 0) {
            layouts.push(gridLayout);
          }
        }
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

    // Try 1 column (vertical stack) - now last priority
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

    // Score each layout and pick the best one, with special scoring for uniform small nodes
    const bestLayout = pickBestLayout(
      layouts,
      optimalWidth,
      availableWidth,
      availableHeight,
      isUniformSized && isSmallNodes
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

    return bestLayout || [];
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

    // Check if children are uniform small nodes (like imports)
    const childValues = children.map(sizeAccessor);
    const avgValue =
      childValues.reduce((sum, val) => sum + val, 0) / childValues.length;
    const maxValue = Math.max(...childValues);
    const minValue = Math.min(...childValues);
    const isUniformSized = maxValue <= minValue * 2;
    const isSmallNodes = avgValue <= 5;

    // For uniform small nodes, try to create more compact horizontal arrangements
    if (isUniformSized && isSmallNodes) {
      // Calculate how many rows we should use based on available space
      const idealNodeHeight = Math.min(
        availableHeight * 0.4,
        Math.max(minNodeSize * 1.5, 40)
      ); // Prefer shorter nodes
      const possibleRows = Math.max(
        1,
        Math.floor(availableHeight / idealNodeHeight)
      );
      const itemsPerRow = Math.ceil(children.length / possibleRows);

      console.log(
        `[PROPORTIONAL LAYOUT] Uniform small nodes detected, creating ${possibleRows} rows with ${itemsPerRow} items per row`
      );

      let currentRow = 0;
      let currentCol = 0;
      const rowHeight = availableHeight / possibleRows;
      const colWidth = availableWidth / itemsPerRow;

      // Ensure each item meets minimum size requirements
      if (colWidth >= minWidth && rowHeight >= minNodeSize) {
        for (const child of children) {
          if (!child) continue;

          const x = currentCol * colWidth;
          const y = currentRow * rowHeight;

          result.push({
            child,
            x,
            y,
            w: colWidth,
            h: rowHeight,
          });

          currentCol++;
          if (currentCol >= itemsPerRow) {
            currentCol = 0;
            currentRow++;
          }
        }

        return result; // Return early with compact grid layout
      }
    }

    // Fall back to original proportional horizontal layout
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
    const viableNodes: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    // First pass: calculate ideal sizes and filter viable nodes
    for (const item of childData) {
      if (!item.child) continue;

      // Calculate width based on value proportion
      const proportionalWidth = item.ratio * availableWidth;

      // Apply constraints - ensure minimum width is respected
      let childW = Math.max(minWidth, Math.min(maxWidth, proportionalWidth));

      // Check if this node can fit in remaining space
      const remainingWidth = availableWidth - currentX;
      if (childW > remainingWidth) {
        if (remainingWidth >= minWidth) {
          childW = remainingWidth; // Use remaining space if it meets minimum
        } else {
          console.log(
            `[PROPORTIONAL LAYOUT] Filtering out child "${item.child.label}" - insufficient width (${remainingWidth} < ${minWidth})`
          );
          continue; // Skip this child if it can't fit
        }
      }

      // Check height constraint
      if (availableHeight < minNodeSize) {
        console.log(
          `[PROPORTIONAL LAYOUT] Filtering out child "${item.child.label}" - insufficient height (${availableHeight} < ${minNodeSize})`
        );
        continue;
      }

      viableNodes.push({
        child: item.child,
        x: currentX,
        y: 0,
        w: childW,
        h: availableHeight,
      });

      currentX += childW;

      // Stop if we've used all available width
      if (currentX >= availableWidth) {
        break;
      }
    }

    // Second pass: redistribute space if we have viable nodes but unused space
    if (viableNodes.length > 0 && currentX < availableWidth) {
      const unusedWidth = availableWidth - currentX;
      const redistributionPerNode = unusedWidth / viableNodes.length;

      console.log(
        `[PROPORTIONAL LAYOUT] Redistributing ${unusedWidth}px among ${viableNodes.length} viable nodes`
      );

      let redistributedX = 0;
      for (const node of viableNodes) {
        node.x = redistributedX;
        node.w += redistributionPerNode; // Give each node its share of unused space
        redistributedX += node.w;
        result.push(node);
      }
    } else {
      // No redistribution needed, use nodes as calculated
      result.push(...viableNodes);
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

        // Final bounds check - ensure dimensions don't exceed container
        targetW = Math.min(targetW, availableWidth);
        targetH = Math.min(targetH, availableHeight);

        return {
          child,
          value,
          ratio,
          targetArea,
          w: targetW,
          h: targetH,
        };
      })
      .filter((item) => {
        // Filter out items that are too small to be viable
        const fitsWidth = item.w >= minWidth && item.w <= availableWidth;
        const fitsHeight = item.h >= minNodeSize && item.h <= availableHeight;

        if (!fitsWidth || !fitsHeight) {
          console.log(
            `[BIN PACKING LAYOUT] Filtering out child "${item.child.label}" - doesn't meet size constraints (w: ${item.w}, h: ${item.h})`
          );
        }

        return fitsWidth && fitsHeight;
      });

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
          // Ensure the node fits within bounds
          if (x + item.w > availableWidth || y + item.h > availableHeight) {
            continue;
          }

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

      if (
        placed &&
        bestX + item.w <= availableWidth &&
        bestY + item.h <= availableHeight
      ) {
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
          `[BIN PACKING LAYOUT] Filtering out child "${item.child.label}" - could not find suitable position within bounds`
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

    // Check if children are uniform small nodes (like imports)
    const childValues = orderedChildren.map(sizeAccessor);
    const avgValue =
      childValues.reduce((sum, val) => sum + val, 0) / childValues.length;
    const maxValue = Math.max(...childValues);
    const minValue = Math.min(...childValues);
    const isUniformSized = maxValue <= minValue * 2;
    const isSmallNodes = avgValue <= 5;

    let columnWidths: number[];
    let rowHeights: number[];

    if (isUniformSized && isSmallNodes) {
      // For uniform small nodes, use equal-sized cells for cleaner layout
      console.log(
        `[FLEXIBLE GRID LAYOUT] Uniform small nodes detected, using equal-sized grid cells`
      );

      const uniformColumnWidth = availableWidth / columns;
      const uniformRowHeight = availableHeight / rows;

      // Check if uniform sizes meet minimum requirements
      if (uniformColumnWidth >= minWidth && uniformRowHeight >= minNodeSize) {
        columnWidths = new Array(columns).fill(uniformColumnWidth);
        rowHeights = new Array(rows).fill(uniformRowHeight);
      } else {
        // Fall back to proportional sizing if uniform doesn't work
        columnWidths = calculateProportionalColumnWidths(
          orderedChildren,
          columns,
          availableWidth,
          minWidth,
          sizeAccessor,
          totalValue
        );
        rowHeights = calculateProportionalRowHeights(
          orderedChildren,
          columns,
          rows,
          availableHeight,
          minNodeSize,
          sizeAccessor,
          totalValue
        );
      }
    } else {
      // For mixed-size nodes, use proportional sizing
      columnWidths = calculateProportionalColumnWidths(
        orderedChildren,
        columns,
        availableWidth,
        minWidth,
        sizeAccessor,
        totalValue
      );
      rowHeights = calculateProportionalRowHeights(
        orderedChildren,
        columns,
        rows,
        availableHeight,
        minNodeSize,
        sizeAccessor,
        totalValue
      );
    }

    // Filter viable columns that can meet minimum width requirement
    const viableColumnIndices: number[] = [];
    const viableColumnWidths: number[] = [];
    let totalViableWidth = 0;

    for (let i = 0; i < columnWidths.length; i++) {
      const width = columnWidths[i];
      if (
        width &&
        width >= minWidth &&
        totalViableWidth + width <= availableWidth
      ) {
        viableColumnIndices.push(i);
        viableColumnWidths.push(width);
        totalViableWidth += width;
      }
    }

    if (viableColumnIndices.length === 0) {
      console.log(
        `[FLEXIBLE GRID LAYOUT] No columns can meet minimum width requirement (${minWidth}px) within available space (${availableWidth}px)`
      );
      return [];
    }

    // Redistribute any unused width among viable columns
    if (totalViableWidth < availableWidth) {
      const unusedWidth = availableWidth - totalViableWidth;
      const redistributionPerColumn = unusedWidth / viableColumnIndices.length;

      for (let i = 0; i < viableColumnWidths.length; i++) {
        const currentWidth = viableColumnWidths[i];
        if (currentWidth !== undefined) {
          viableColumnWidths[i] = currentWidth + redistributionPerColumn;
        }
      }
    }

    // Place children in viable columns only (in source order) with calculated widths
    let columnStartX = 0;
    const viableNodes: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    for (
      let viableColIndex = 0;
      viableColIndex < viableColumnIndices.length;
      viableColIndex++
    ) {
      const originalColIndex = viableColumnIndices[viableColIndex];
      const columnWidth = viableColumnWidths[viableColIndex];

      if (originalColIndex === undefined) {
        console.log(
          `[FLEXIBLE GRID LAYOUT] Skipping undefined column index at position ${viableColIndex}`
        );
        continue;
      }

      if (!columnWidth || columnWidth < minWidth) {
        console.log(
          `[FLEXIBLE GRID LAYOUT] Skipping viable column ${originalColIndex} - width too narrow (${columnWidth} < ${minWidth})`
        );
        continue;
      }

      if (viableColIndex > 0) {
        const prevWidth = viableColumnWidths[viableColIndex - 1];
        if (prevWidth !== undefined) {
          columnStartX += prevWidth;
        }
      }

      let currentY = 0;
      for (let row = 0; row < rows; row++) {
        const childIndex = row * columns + originalColIndex;
        if (childIndex >= orderedChildren.length) break;

        const child = orderedChildren[childIndex];
        const rowHeight = rowHeights[row];

        if (!child || rowHeight === undefined) continue;

        // Final bounds check before adding node
        if (
          columnStartX + columnWidth <= availableWidth &&
          currentY + rowHeight <= availableHeight &&
          columnWidth >= minWidth &&
          rowHeight >= minNodeSize
        ) {
          viableNodes.push({
            child,
            x: columnStartX,
            y: currentY,
            w: columnWidth,
            h: rowHeight,
          });
        } else {
          console.log(
            `[FLEXIBLE GRID LAYOUT] Filtering out child "${child.label}" - exceeds container bounds`
          );
        }

        currentY += rowHeight;
      }
    }

    result.push(...viableNodes);
    return result;
  }

  // Helper function to calculate proportional column widths
  function calculateProportionalColumnWidths(
    orderedChildren: ScopeNode[],
    columns: number,
    availableWidth: number,
    minWidth: number,
    sizeAccessor: (n: ScopeNode) => number,
    totalValue: number
  ): number[] {
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

    return columnWidths;
  }

  // Helper function to calculate proportional row heights
  function calculateProportionalRowHeights(
    orderedChildren: ScopeNode[],
    columns: number,
    rows: number,
    availableHeight: number,
    minNodeSize: number,
    sizeAccessor: (n: ScopeNode) => number,
    totalValue: number
  ): number[] {
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

    return rowHeights;
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
        `[VERTICAL LAYOUT] Available width (${availableWidth}) is less than minimum (${minWidth}), filtering out all children`
      );
      return result;
    }

    let currentY = 0;
    const viableNodes: Array<{
      child: ScopeNode;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    console.log(
      `[VERTICAL LAYOUT] Creating vertical stack for ${children.length} children in source order:`,
      children.map((child, index) => ({
        index,
        label: child.label,
        startLine: child.loc?.start.line || "unknown",
        value: sizeAccessor(child),
      }))
    );

    // First pass: collect viable nodes that fit within bounds
    for (const child of children) {
      if (!child) continue; // Guard against undefined

      const childValue = sizeAccessor(child);
      const ratio = childValue / totalValue;
      const childH = Math.max(minNodeSize, availableHeight * ratio);

      // Check if this node fits within remaining space
      if (
        currentY + childH <= availableHeight &&
        availableWidth >= minWidth &&
        childH >= minNodeSize
      ) {
        viableNodes.push({
          child,
          x: 0,
          y: currentY,
          w: availableWidth,
          h: childH,
        });

        currentY += childH;
      } else {
        console.log(
          `[VERTICAL LAYOUT] Filtering out child "${child.label}" - exceeds container bounds (y: ${currentY + childH} > ${availableHeight})`
        );
      }
    }

    // Second pass: redistribute unused vertical space if any
    if (viableNodes.length > 0 && currentY < availableHeight) {
      const unusedHeight = availableHeight - currentY;
      const redistributionPerNode = unusedHeight / viableNodes.length;

      console.log(
        `[VERTICAL LAYOUT] Redistributing ${unusedHeight}px among ${viableNodes.length} viable nodes`
      );

      let redistributedY = 0;
      for (const node of viableNodes) {
        node.y = redistributedY;
        node.h += redistributionPerNode; // Give each node its share of unused space
        redistributedY += node.h;
        result.push(node);
      }
    } else {
      // No redistribution needed, use nodes as calculated
      result.push(...viableNodes);
    }

    return result;
  }

  function pickBestLayout(
    layouts: Array<
      Array<{ child: ScopeNode; x: number; y: number; w: number; h: number }>
    >,
    optimalWidth: number,
    availableWidth: number,
    availableHeight: number,
    isUniformSmallNodes: boolean = false
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
      availableHeight,
      isUniformSmallNodes
    );

    for (let i = 1; i < layouts.length; i++) {
      const layout = layouts[i];
      if (!layout) continue;

      const score = scoreLayout(
        layout,
        optimalWidth,
        availableWidth,
        availableHeight,
        isUniformSmallNodes
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
    availableHeight: number,
    isUniformSmallNodes: boolean = false
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

      // Aspect ratio scoring - heavily favor wider, shorter rectangles for uniform small nodes
      const aspectRatio = item.w / item.h;
      let aspectScore;

      if (isUniformSmallNodes) {
        // For uniform small nodes (like imports), heavily favor wider rectangles
        if (aspectRatio >= 2 && aspectRatio <= 6) {
          aspectScore = 1.5; // Strong bonus for wide rectangles
        } else if (aspectRatio >= 1.5 && aspectRatio <= 8) {
          aspectScore = 1.2; // Good bonus for moderately wide rectangles
        } else if (aspectRatio >= 1 && aspectRatio <= 10) {
          aspectScore = 1.0; // Neutral for square to wide rectangles
        } else if (aspectRatio >= 0.5) {
          aspectScore = 0.5; // Penalty for tall rectangles
        } else {
          aspectScore = 0.2; // Heavy penalty for very tall rectangles
        }
      } else {
        // Original aspect ratio scoring for other nodes
        if (aspectRatio >= 0.5 && aspectRatio <= 3) {
          aspectScore = 1.0; // Ideal aspect ratio
        } else if (aspectRatio >= 0.3 && aspectRatio <= 5) {
          aspectScore = 0.8; // Acceptable
        } else {
          aspectScore = 0.4; // Poor aspect ratio
        }
      }

      // Width scoring - adjust for uniform small nodes
      let widthScore;
      if (isUniformSmallNodes) {
        // For uniform small nodes, be less restrictive about width
        const widthRatio = item.w / optimalWidth;
        if (widthRatio >= 0.8 && widthRatio <= 3) {
          widthScore = 1.2; // Bonus for reasonable widths
        } else if (widthRatio >= 0.5 && widthRatio <= 5) {
          widthScore = 1.0; // Neutral for wider range
        } else {
          widthScore = 0.7; // Mild penalty
        }
      } else {
        // Original width scoring
        const widthRatio = item.w / optimalWidth;
        if (widthRatio <= 1.5) {
          widthScore = 1.0;
        } else if (widthRatio <= 3) {
          widthScore = 0.7;
        } else if (widthRatio <= 5) {
          widthScore = 0.3;
        } else {
          widthScore = 0.1;
        }
      }

      score += (widthScore + aspectScore) * area * complexityWeight;

      // Adjust width penalty for uniform small nodes
      if (isUniformSmallNodes) {
        // Be more lenient about wide nodes for uniform small nodes
        if (item.w > availableWidth * 0.8) {
          widthPenalty += area * 0.2; // Lighter penalty
        }
      } else {
        // Original width penalty
        if (item.w > availableWidth * 0.6) {
          widthPenalty += area * 0.5;
        }
      }
    }

    // Apply width penalty
    score -= widthPenalty;

    // Prefer layouts that use more of the available space
    const spaceUtilization = totalArea / (availableWidth * availableHeight);
    score *= Math.sqrt(spaceUtilization);

    // Enhanced bonus for multi-item layouts, especially for uniform small nodes
    if (layout.length > 1) {
      const multiItemBonus = isUniformSmallNodes ? 1.5 : 1.2; // Stronger bonus for uniform small nodes
      score *= multiItemBonus;
    }
    if (layout.length > 2) {
      const extraItemBonus = isUniformSmallNodes ? 1.3 : 1.1; // Extra bonus for 3+ items
      score *= extraItemBonus;
    }

    // Special bonus for horizontal arrangements of uniform small nodes
    if (isUniformSmallNodes && layout.length > 1) {
      // Check if this is roughly a horizontal arrangement (all items at similar Y)
      const firstY = layout[0]?.y ?? 0;
      const isHorizontalArrangement = layout.every(
        (item) => Math.abs(item.y - firstY) < availableHeight * 0.2
      );

      if (isHorizontalArrangement) {
        score *= 1.4; // Strong bonus for horizontal arrangements
      }
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
