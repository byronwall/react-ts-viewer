import type { ScopeNode } from "../../types";

export interface BinaryLayoutNode {
  node: ScopeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  children?: BinaryLayoutNode[];
  renderMode: "text" | "box" | "none";
  isConstrainedByDepth?: boolean;
  hasHiddenChildren?: boolean;
  hiddenChildrenCount?: number;
  isLShaped?: boolean; // Indicates if this container has L-shaped layout
  segments?: { x: number; y: number; w: number; h: number }[]; // For L-shaped containers
  value: number;
}

export interface BinaryLayoutOptions {
  sizeAccessor?: (n: ScopeNode) => number;
  minTextWidth?: number;
  minTextHeight?: number;
  minBoxSize?: number;
  padding?: number;
  headerHeight?: number;
  fontSize?: number;
}

export type BinaryLayoutFn = (
  root: ScopeNode,
  w: number,
  h: number,
  opts?: BinaryLayoutOptions
) => BinaryLayoutNode;

interface AvailableSpace {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PackedNode {
  node: ScopeNode;
  space: AvailableSpace;
  renderMode: "text" | "box" | "none";
  value: number;
}

export const binaryLayout: BinaryLayoutFn = (root, w, h, opts = {}) => {
  console.log("[BINARY LAYOUT CALLED] binaryLayout called with:", {
    root,
    w,
    h,
    opts,
  });
  const {
    sizeAccessor = (n) => n.value,
    minTextWidth = 40,
    minTextHeight = 20,
    minBoxSize = 12,
    padding = 4,
    headerHeight = 28,
    fontSize = 11,
  } = opts;

  // Calculate header height based on depth
  const getHeaderHeight = (depth: number, availableHeight: number): number => {
    const maxHeaderHeight = headerHeight;
    const minHeaderHeight = Math.max(16, fontSize + 8);

    // Reduce header size with depth but not too aggressively
    const depthFactor = Math.max(0.85, 1 - depth * 0.03);
    const baseHeight = Math.max(minHeaderHeight, maxHeaderHeight * depthFactor);

    // Don't let header take more than 40% of available height
    const maxAllowedHeight = Math.max(
      baseHeight,
      Math.min(availableHeight * 0.4, baseHeight * 1.3)
    );

    return maxAllowedHeight;
  };

  // Determine render mode for a node based on available space
  const determineRenderMode = (
    width: number,
    height: number,
    hasChildren: boolean
  ): "text" | "box" | "none" => {
    if (width < minBoxSize || height < minBoxSize) {
      return "none";
    }

    // For leaf nodes, prefer text rendering if space allows
    if (!hasChildren) {
      if (width >= minTextWidth && height >= minTextHeight) {
        return "text";
      } else if (width >= minBoxSize && height >= minBoxSize) {
        return "box";
      }
    } else {
      // For container nodes, always use text if space allows (for headers)
      if (width >= minTextWidth && height >= minTextHeight) {
        return "text";
      } else if (width >= minBoxSize && height >= minBoxSize) {
        return "box";
      }
    }

    return "none";
  };

  // Check if all nodes can fit with their preferred size
  const canAllNodesFitWithText = (
    nodes: ScopeNode[],
    totalValue: number,
    availableWidth: number,
    availableHeight: number
  ): boolean => {
    const availableArea = availableWidth * availableHeight;
    const minTextArea = minTextWidth * minTextHeight;

    // Simple check: can we fit minimum text rectangles with reasonable overhead?
    const totalMinTextArea = nodes.length * minTextArea;
    const basicCheck = totalMinTextArea <= availableArea * 0.9; // More generous - use 90%

    console.log(
      `[CAN FIT TEXT] Basic check: ${nodes.length} nodes need ${totalMinTextArea}, have ${availableArea * 0.9}, result: ${basicCheck}`
    );

    return basicCheck; // Simplified - if basic check passes, we're good
  };

  // Check if all nodes can fit as boxes
  const canAllNodesFitAsBoxes = (
    nodes: ScopeNode[],
    availableWidth: number,
    availableHeight: number
  ): boolean => {
    const boxArea = minBoxSize * minBoxSize;
    const requiredArea = nodes.length * boxArea;
    const availableArea = availableWidth * availableHeight;

    const canFit = requiredArea <= availableArea * 0.8; // More generous for boxes
    console.log(
      `[CAN FIT BOXES] Need ${requiredArea}, have ${availableArea * 0.8}, result: ${canFit}`
    );
    return canFit;
  };

  // Improved bin pack nodes with proportional sizing and aspect ratio constraints
  const binPackNodes = (
    nodes: ScopeNode[],
    availableWidth: number,
    availableHeight: number,
    totalValue: number,
    useTextMode: boolean
  ): PackedNode[] => {
    const packedNodes: PackedNode[] = [];
    const availableArea = availableWidth * availableHeight;

    console.log(
      `[BIN PACK] Packing ${nodes.length} nodes in ${useTextMode ? "text" : "box"} mode, available space: ${availableWidth}x${availableHeight}`
    );

    // Check if horizontal layout would create readable rectangles
    const horizontalWidth = availableWidth / nodes.length;
    const horizontalHeight = availableHeight;
    const horizontalAspectRatio = horizontalWidth / horizontalHeight;

    // Ideal aspect ratio range for text: 1.5 to 4.0 (wider than tall, but not too wide)
    const minReadableAspectRatio = 0.75; // Minimum acceptable (slightly tall is ok)
    const maxReadableAspectRatio = 6.0; // Maximum acceptable (not too wide)
    const idealMinAspectRatio = 1.5; // Prefer wider than tall

    console.log(
      `[BIN PACK] Horizontal layout would give ${horizontalWidth.toFixed(1)}x${horizontalHeight.toFixed(1)} (aspect ratio: ${horizontalAspectRatio.toFixed(2)})`
    );

    // Check value distribution to decide if proportional layout is preferred
    const values = nodes.map((node) => sizeAccessor(node)).filter((v) => v > 0);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const valueRatio = maxValue / (minValue || 1);
    const hasSignificantValueDifferences = valueRatio > 3; // If largest is 3x+ bigger than smallest

    console.log(
      `[BIN PACK] Value distribution: max=${maxValue}, min=${minValue}, ratio=${valueRatio.toFixed(1)}, significantDiff=${hasSignificantValueDifferences}`
    );

    // Try different layout strategies based on space and aspect ratios
    let selectedLayout: "horizontal" | "grid" | "vertical" = "horizontal";
    let gridRows = 1;
    let gridCols = nodes.length;

    // If horizontal layout creates unreadable rectangles, try grid layouts
    // Always try grid if aspect ratio is poor, regardless of value differences
    if (horizontalAspectRatio < minReadableAspectRatio) {
      console.log(
        `[BIN PACK] Horizontal layout too tall (${horizontalAspectRatio.toFixed(2)}), trying grid layouts`
      );

      // Try different grid configurations
      let bestAspectRatio = horizontalAspectRatio;
      let bestLayout = { rows: 1, cols: nodes.length };

      // Try 2 rows, 3 rows, etc.
      for (let rows = 2; rows <= Math.min(4, nodes.length); rows++) {
        const cols = Math.ceil(nodes.length / rows);
        const gridWidth = availableWidth / cols;
        const gridHeight = availableHeight / rows;
        const gridAspectRatio = gridWidth / gridHeight;

        console.log(
          `[BIN PACK] Grid ${rows}x${cols}: ${gridWidth.toFixed(1)}x${gridHeight.toFixed(1)} (aspect ratio: ${gridAspectRatio.toFixed(2)})`
        );

        // Prefer aspect ratios closer to ideal range
        const isInIdealRange =
          gridAspectRatio >= idealMinAspectRatio &&
          gridAspectRatio <= maxReadableAspectRatio;
        const wasInIdealRange =
          bestAspectRatio >= idealMinAspectRatio &&
          bestAspectRatio <= maxReadableAspectRatio;

        if (isInIdealRange && !wasInIdealRange) {
          // This grid is in ideal range, previous wasn't
          bestAspectRatio = gridAspectRatio;
          bestLayout = { rows, cols };
        } else if (isInIdealRange && wasInIdealRange) {
          // Both in ideal range, prefer closer to 2.5 (ideal for text)
          const currentDistance = Math.abs(gridAspectRatio - 2.5);
          const bestDistance = Math.abs(bestAspectRatio - 2.5);
          if (currentDistance < bestDistance) {
            bestAspectRatio = gridAspectRatio;
            bestLayout = { rows, cols };
          }
        } else if (!isInIdealRange && !wasInIdealRange) {
          // Neither in ideal range, prefer larger aspect ratio (less tall)
          if (gridAspectRatio > bestAspectRatio) {
            bestAspectRatio = gridAspectRatio;
            bestLayout = { rows, cols };
          }
        }
      }

      if (bestLayout.rows > 1) {
        selectedLayout = "grid";
        gridRows = bestLayout.rows;
        gridCols = bestLayout.cols;
        console.log(
          `[BIN PACK] Selected grid layout: ${gridRows}x${gridCols} (aspect ratio: ${bestAspectRatio.toFixed(2)})`
        );
      }
    }

    // Apply the selected layout strategy
    if (selectedLayout === "grid") {
      // Grid layout with proportional sizing within cells
      console.log(
        `[BIN PACK] Using grid layout with ${hasSignificantValueDifferences ? "proportional" : "uniform"} cell sizing`
      );

      if (hasSignificantValueDifferences) {
        // Proportional grid: distribute nodes by value within each row
        const nodesPerRow = gridCols;
        let currentNodeIndex = 0;

        for (let row = 0; row < gridRows; row++) {
          const rowStartIndex = currentNodeIndex;
          const rowNodes = nodes.slice(
            rowStartIndex,
            rowStartIndex + nodesPerRow
          );
          currentNodeIndex += rowNodes.length;

          if (rowNodes.length === 0) continue;

          // Calculate total value for this row
          const rowTotalValue = rowNodes.reduce(
            (sum, node) => sum + sizeAccessor(node),
            0
          );
          const rowY = row * (availableHeight / gridRows);
          const rowHeight = availableHeight / gridRows;

          let currentX = 0;
          for (const node of rowNodes) {
            const nodeValue = sizeAccessor(node);
            if (nodeValue <= 0) continue;

            // Calculate proportional width within the row
            const valueRatio = nodeValue / rowTotalValue;
            let targetWidth = valueRatio * availableWidth;
            let targetHeight = rowHeight;

            // Apply minimum constraints
            if (useTextMode) {
              targetWidth = Math.max(minTextWidth, targetWidth);
              targetHeight = Math.max(minTextHeight, targetHeight);
            } else {
              targetWidth = Math.max(minBoxSize, targetWidth);
              targetHeight = Math.max(minBoxSize, targetHeight);
            }

            const packedNode: PackedNode = {
              node,
              space: {
                x: currentX,
                y: rowY,
                w: targetWidth,
                h: targetHeight,
              },
              renderMode: useTextMode ? "text" : "box",
              value: nodeValue,
            };

            packedNodes.push(packedNode);
            currentX += targetWidth;

            console.log(
              `[BIN PACK] Packed node "${node.label}" (value: ${nodeValue}) at ${targetWidth.toFixed(0)}x${targetHeight.toFixed(0)} in proportional row ${row}`
            );
          }
        }
      } else {
        // Uniform grid: equal cell sizes
        const cellWidth = availableWidth / gridCols;
        const cellHeight = availableHeight / gridRows;

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (!node) continue;

          const nodeValue = sizeAccessor(node);
          if (nodeValue <= 0) continue;

          const row = Math.floor(i / gridCols);
          const col = i % gridCols;

          let targetWidth = cellWidth;
          let targetHeight = cellHeight;

          // Apply minimum constraints
          if (useTextMode) {
            targetWidth = Math.max(minTextWidth, targetWidth);
            targetHeight = Math.max(minTextHeight, targetHeight);
          } else {
            targetWidth = Math.max(minBoxSize, targetWidth);
            targetHeight = Math.max(minBoxSize, targetHeight);
          }

          // Position in grid
          const x = col * cellWidth;
          const y = row * cellHeight;

          const packedNode: PackedNode = {
            node,
            space: {
              x: x,
              y: y,
              w: targetWidth,
              h: targetHeight,
            },
            renderMode: useTextMode ? "text" : "box",
            value: nodeValue,
          };

          packedNodes.push(packedNode);

          console.log(
            `[BIN PACK] Packed node "${node.label}" (value: ${nodeValue}) at ${targetWidth.toFixed(0)}x${targetHeight.toFixed(0)} in grid position (${row},${col})`
          );
        }
      }
    } else {
      // Horizontal layout with proportional widths (original strategy)
      let currentX = 0;
      const containerHeight = availableHeight;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;

        const nodeValue = sizeAccessor(node);
        if (nodeValue <= 0) continue;

        // Calculate proportional width based on value
        const valueRatio = nodeValue / totalValue;
        let targetWidth = valueRatio * availableWidth;
        let targetHeight = containerHeight;

        // Apply minimum constraints
        if (useTextMode) {
          targetWidth = Math.max(minTextWidth, targetWidth);
          targetHeight = Math.max(minTextHeight, targetHeight);
        } else {
          targetWidth = Math.max(minBoxSize, targetWidth);
          targetHeight = Math.max(minBoxSize, targetHeight);
        }

        // Ensure we don't exceed available space
        const remainingWidth = availableWidth - currentX;
        if (targetWidth > remainingWidth) {
          targetWidth = remainingWidth;
        }

        // Only pack if we have meaningful space
        if (targetWidth >= minBoxSize && targetHeight >= minBoxSize) {
          const packedNode: PackedNode = {
            node,
            space: {
              x: currentX,
              y: 0,
              w: targetWidth,
              h: targetHeight,
            },
            renderMode: useTextMode ? "text" : "box",
            value: nodeValue,
          };

          packedNodes.push(packedNode);
          currentX += targetWidth;

          console.log(
            `[BIN PACK] Packed node "${node.label}" (value: ${nodeValue}) at ${targetWidth.toFixed(0)}x${targetHeight.toFixed(0)}`
          );
        } else {
          console.log(
            `[BIN PACK] Could not pack node "${node.label}" - insufficient space (${targetWidth.toFixed(0)}x${targetHeight.toFixed(0)})`
          );
          break; // Stop packing if we run out of space
        }
      }
    }

    return packedNodes;
  };

  // Main recursive layout function using breadth-first approach
  function layoutRecursive(
    node: ScopeNode,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number
  ): BinaryLayoutNode {
    console.log(
      `[BINARY LAYOUT] Processing "${node.label}" at depth ${depth}, size: ${width}x${height}`
    );

    const hasChildren = node.children && node.children.length > 0;
    const renderMode = determineRenderMode(width, height, hasChildren);

    const layoutNode: BinaryLayoutNode = {
      node,
      x,
      y,
      w: width,
      h: height,
      renderMode,
      children: [],
      value: sizeAccessor(node),
    };

    // If no children or too small to render children, return early
    if (
      !hasChildren ||
      renderMode === "none" ||
      width < minBoxSize * 2 ||
      height < minBoxSize * 2
    ) {
      return layoutNode;
    }

    // Filter viable children
    const viableChildren = node.children!.filter(
      (child) => sizeAccessor(child) > 0
    );

    if (viableChildren.length === 0) {
      return layoutNode;
    }

    // Calculate available space for children
    const headerHeightForContainer =
      renderMode === "text" ? getHeaderHeight(depth, height) : 0;
    const paddingToApply = depth > 0 ? padding : 0;

    const availableWidth = width - 2 * paddingToApply;
    const availableHeight =
      height - headerHeightForContainer - 2 * paddingToApply;

    if (availableWidth < minBoxSize || availableHeight < minBoxSize) {
      layoutNode.hasHiddenChildren = true;
      layoutNode.hiddenChildrenCount = viableChildren.length;
      return layoutNode;
    }

    const totalValue = viableChildren.reduce(
      (sum, child) => sum + sizeAccessor(child),
      0
    );
    if (totalValue === 0) return layoutNode;

    // Breadth-first analysis: determine rendering strategy for this level
    const canFitAllText = canAllNodesFitWithText(
      viableChildren,
      totalValue,
      availableWidth,
      availableHeight
    );
    const canFitAllBoxes = canAllNodesFitAsBoxes(
      viableChildren,
      availableWidth,
      availableHeight
    );

    console.log(
      `[BINARY LAYOUT] Depth ${depth}: text=${canFitAllText}, boxes=${canFitAllBoxes}, children=${viableChildren.length}`
    );

    if (!canFitAllText && !canFitAllBoxes) {
      // Can't fit all children, mark as constrained
      layoutNode.hasHiddenChildren = true;
      layoutNode.hiddenChildrenCount = viableChildren.length;
      layoutNode.isConstrainedByDepth = true;
      return layoutNode;
    }

    // Create initial available space
    const startX = x + paddingToApply;
    const startY = y + headerHeightForContainer + paddingToApply;

    // Use text mode if possible, otherwise use box mode
    const useTextMode = canFitAllText;

    // Bin pack children in source order using improved algorithm
    const packedNodes = binPackNodes(
      viableChildren,
      availableWidth,
      availableHeight,
      totalValue,
      useTextMode
    );

    // Recursively layout packed children
    const layoutChildren: BinaryLayoutNode[] = [];
    let hiddenCount = 0;

    for (const packed of packedNodes) {
      if (packed.renderMode !== "none") {
        const childLayout = layoutRecursive(
          packed.node,
          startX + packed.space.x,
          startY + packed.space.y,
          packed.space.w,
          packed.space.h,
          depth + 1
        );

        if (childLayout.renderMode !== "none") {
          layoutChildren.push(childLayout);
        } else {
          hiddenCount++;
        }
      } else {
        hiddenCount++;
      }
    }

    // Track children that couldn't be packed
    const unpackedCount = viableChildren.length - packedNodes.length;
    const totalHiddenCount = hiddenCount + unpackedCount;

    if (totalHiddenCount > 0) {
      layoutNode.hasHiddenChildren = true;
      layoutNode.hiddenChildrenCount = totalHiddenCount;

      // Update node metadata
      const updatedNode = { ...layoutNode.node };
      updatedNode.meta = {
        ...updatedNode.meta,
        hasHiddenChildren: true,
        hiddenChildrenCount: totalHiddenCount,
        hiddenReason:
          unpackedCount > 0 ? "bin_packing_constraints" : "size_constraints",
      };
      layoutNode.node = updatedNode;
    }

    layoutNode.children = layoutChildren;

    console.log(
      `[BINARY LAYOUT] Completed "${node.label}": packed ${packedNodes.length}/${viableChildren.length}, rendered ${layoutChildren.length}, hidden ${totalHiddenCount}`
    );

    return layoutNode;
  }

  return layoutRecursive(root, 0, 0, w, h, 0);
};
