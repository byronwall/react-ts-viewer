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
  renderMode?: "text" | "box" | "none";
  isConstrainedByDepth?: boolean;
}

export interface LayoutOptions {
  aspectTarget?: number;
  sizeAccessor?: (n: ScopeNode) => number;
  minSizeForText?: number;
  minNodeSize?: number;
  optimalCharWidth?: number;
  minCharWidth?: number;
  maxCharWidth?: number;
  headerHeight?: number;
  fontSize?: number;
  minFontSize?: number;
  padding?: number;
  minWidthPx?: number;
  strictDepthConstraint?: boolean;
  maxDepthForText?: number;
}

export type ImprovedLayoutFn = (
  root: ScopeNode,
  w: number,
  h: number,
  opts?: LayoutOptions
) => LayoutNode;

// Common aspect ratios for pleasing layouts - PRIORITIZE HORIZONTAL for text readability
// NOTE: These are now used more as layout templates, actual sizing is value-based
const COMMON_PROPORTIONS = {
  2: [
    { ratios: [], layout: "horizontal" }, // Equal horizontal split - best for text
    { ratios: [], layout: "vertical" }, // Vertical only as fallback
  ],
  3: [
    { ratios: [], layout: "horizontal" }, // Equal horizontal split - best for text
    { ratios: [], layout: "vertical_with_split" }, // Top half, then split bottom (disabled for now)
  ],
  4: [
    { ratios: [], layout: "horizontal" }, // Equal horizontal split - best for text
    { ratios: [], layout: "grid_2x2" }, // Grid layout - good for text
  ],
};

interface PlacementArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface NodePlacement {
  node: ScopeNode;
  area: PlacementArea;
  originalIndex: number;
}

export const improvedLayout: ImprovedLayoutFn = (root, w, h, opts = {}) => {
  const {
    sizeAccessor = (n) => n.value,
    minSizeForText = 60,
    minNodeSize = 16,
    optimalCharWidth = 12,
    minCharWidth = 8,
    maxCharWidth = 20,
    headerHeight = 32,
    fontSize = 11,
    minFontSize = 12,
    padding = 4,
    minWidthPx = 80,
    strictDepthConstraint = true,
    maxDepthForText = 5,
  } = opts;

  // Calculate pixel width needed for character count
  const getPixelWidthForChars = (charCount: number): number => {
    return charCount * fontSize * 0.6;
  };

  const optimalWidth = getPixelWidthForChars(optimalCharWidth);
  const minWidth = Math.max(minWidthPx, getPixelWidthForChars(minCharWidth));
  const maxWidth = getPixelWidthForChars(maxCharWidth);

  // Determine if we can fit all nodes with text at current depth
  const canFitAllNodesWithText = (
    nodes: ScopeNode[],
    availableWidth: number,
    availableHeight: number,
    depth: number
  ): boolean => {
    if (depth > maxDepthForText) return false;

    const totalValue = nodes.reduce((sum, node) => sum + sizeAccessor(node), 0);
    if (totalValue === 0) return false;

    // Estimate minimum area needed for each node to show text
    let totalMinArea = 0;
    for (const node of nodes) {
      const minTextArea = minSizeForText * minSizeForText;
      totalMinArea += minTextArea;
    }

    const availableArea = availableWidth * availableHeight;
    return totalMinArea <= availableArea * 0.8; // Allow 20% overhead
  };

  // Get render mode for a node based on size and depth
  const getRenderMode = (
    width: number,
    height: number,
    depth: number
  ): "text" | "box" | "none" => {
    if (width < minNodeSize || height < minNodeSize) return "none";
    if (depth > maxDepthForText) return "box";

    const area = width * height;
    if (area >= minSizeForText && width >= minWidth) return "text";
    if (area >= minNodeSize * minNodeSize) return "box";
    return "none";
  };

  // Calculate header height based on available space and depth
  const calculateHeaderHeight = (
    availableHeight: number,
    depth: number
  ): number => {
    const baseHeaderHeight = headerHeight;
    const depthReduction = Math.max(0, depth * 4);
    const calculatedHeight = Math.max(16, baseHeaderHeight - depthReduction);
    return Math.min(calculatedHeight, availableHeight * 0.4);
  };

  // Try common proportional layouts for small numbers of children
  const tryCommonProportions = (
    children: ScopeNode[],
    availableWidth: number,
    availableHeight: number,
    totalValue: number
  ): NodePlacement[] | null => {
    const count = children.length;
    const proportions =
      COMMON_PROPORTIONS[count as keyof typeof COMMON_PROPORTIONS];

    if (!proportions) return null;

    let bestLayout: NodePlacement[] | null = null;
    let bestScore = -1;

    for (const proportion of proportions) {
      const placement = layoutWithProportion(
        children,
        availableWidth,
        availableHeight,
        totalValue,
        proportion
      );

      if (
        placement &&
        validatePlacement(placement, availableWidth, availableHeight)
      ) {
        // Score this layout for value preservation (bin-packing principle)
        const score = scoreLayoutForValuePreservation(placement, totalValue);
        console.log(
          `[COMMON PROPORTIONS] Layout "${proportion.layout}" scored ${score.toFixed(2)} for value preservation`
        );

        if (score > bestScore) {
          bestScore = score;
          bestLayout = placement;
        }
      }
    }

    if (bestLayout) {
      console.log(
        `[COMMON PROPORTIONS] Selected best layout with score ${bestScore.toFixed(2)}`
      );
    }

    return bestLayout;
  };

  // Layout children according to a specific proportion template
  const layoutWithProportion = (
    children: ScopeNode[],
    availableWidth: number,
    availableHeight: number,
    totalValue: number,
    proportion: { ratios: number[]; layout: string }
  ): NodePlacement[] | null => {
    const placements: NodePlacement[] = [];
    const { layout } = proportion;

    // Calculate value-based ratios instead of using fixed ratios for bin-packing
    const valueBasedRatios = children.map(
      (child) => sizeAccessor(child) / totalValue
    );

    switch (layout) {
      case "horizontal": {
        let currentX = 0;

        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const valueRatio = valueBasedRatios[i];
          if (!child || !valueRatio) continue;

          // Use value-based width instead of fixed ratio
          const width = valueRatio * availableWidth;
          let placement = {
            node: child,
            area: { x: currentX, y: 0, w: width, h: availableHeight },
            originalIndex: i,
          };

          // Apply constraints softly - only if they don't severely impact sizing
          placement = applySoftConstraints(
            placement,
            availableWidth,
            availableHeight
          );
          placements.push(placement);
          currentX += placement.area.w;
        }
        break;
      }

      case "vertical": {
        // Skip vertical layouts if there are any leaf nodes
        const hasLeafNodes = children.some((child) => isLeafNode(child));
        if (hasLeafNodes) {
          console.log(
            `[LAYOUT WITH PROPORTION] Skipping vertical layout due to leaf nodes`
          );
          return null;
        }

        let currentY = 0;

        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const valueRatio = valueBasedRatios[i];
          if (!child || !valueRatio) continue;

          // Use value-based height instead of fixed ratio
          const height = valueRatio * availableHeight;
          let placement = {
            node: child,
            area: { x: 0, y: currentY, w: availableWidth, h: height },
            originalIndex: i,
          };

          // Apply constraints softly
          placement = applySoftConstraints(
            placement,
            availableWidth,
            availableHeight
          );
          placements.push(placement);
          currentY += placement.area.h;
        }
        break;
      }

      case "grid_2x2": {
        if (children.length !== 4) return null;

        // For grid layouts, allocate space based on values but within grid structure
        const halfWidth = availableWidth / 2;
        const halfHeight = availableHeight / 2;

        // Calculate relative values for each quadrant
        const topLeftValue = children[0] ? sizeAccessor(children[0]) : 0;
        const topRightValue = children[1] ? sizeAccessor(children[1]) : 0;
        const bottomLeftValue = children[2] ? sizeAccessor(children[2]) : 0;
        const bottomRightValue = children[3] ? sizeAccessor(children[3]) : 0;

        const topRowTotal = topLeftValue + topRightValue;
        const bottomRowTotal = bottomLeftValue + bottomRightValue;
        const leftColTotal = topLeftValue + bottomLeftValue;
        const rightColTotal = topRightValue + bottomRightValue;

        // Adjust widths and heights based on values while maintaining grid structure
        const topHeight =
          topRowTotal > 0
            ? (topRowTotal / totalValue) * availableHeight
            : halfHeight;
        const bottomHeight = availableHeight - topHeight;
        const leftWidth =
          leftColTotal > 0
            ? (leftColTotal / totalValue) * availableWidth
            : halfWidth;
        const rightWidth = availableWidth - leftWidth;

        const positions = [
          { x: 0, y: 0, w: leftWidth, h: topHeight },
          { x: leftWidth, y: 0, w: rightWidth, h: topHeight },
          { x: 0, y: topHeight, w: leftWidth, h: bottomHeight },
          { x: leftWidth, y: topHeight, w: rightWidth, h: bottomHeight },
        ];

        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const pos = positions[i];
          if (!child || !pos) continue;

          let placement = {
            node: child,
            area: { x: pos.x, y: pos.y, w: pos.w, h: pos.h },
            originalIndex: i,
          };

          // Apply constraints softly
          placement = applySoftConstraints(placement, pos.w, pos.h);
          placements.push(placement);
        }
        break;
      }

      default:
        // Unknown layout type
        return null;
    }

    return placements;
  };

  // Check if a node is a leaf (no children)
  const isLeafNode = (node: ScopeNode): boolean => {
    return !node.children || node.children.length === 0;
  };

  // Soft constraint application - prioritizes value-based sizing but enforces readability
  const applySoftConstraints = (
    placement: NodePlacement,
    maxWidth: number,
    maxHeight: number
  ): NodePlacement => {
    const { area } = placement;
    const aspectRatio = area.w / area.h;

    // For leaf nodes: enforce minimum aspect ratio of 1.0 (never taller than wide)
    // For container nodes: enforce minimum aspect ratio of 0.5 (not extremely tall)
    const minAspectRatio = isLeafNode(placement.node) ? 1.0 : 0.5;

    if (aspectRatio < minAspectRatio) {
      console.log(
        `[CONSTRAINTS] Adjusting ${isLeafNode(placement.node) ? "leaf" : "container"} node: ${area.w}x${area.h} (aspect ratio: ${aspectRatio.toFixed(2)})`
      );

      // Try to preserve area while achieving minimum aspect ratio
      const currentArea = area.w * area.h;

      // Calculate new dimensions: area = w * h, and w = minAspectRatio * h
      // So: area = minAspectRatio * h^2, therefore h = sqrt(area / minAspectRatio)
      let newHeight = Math.sqrt(currentArea / minAspectRatio);
      let newWidth = newHeight * minAspectRatio;

      // Constrain to available space
      if (newWidth > maxWidth) {
        newWidth = maxWidth;
        newHeight = newWidth / minAspectRatio;
      }

      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = newHeight * minAspectRatio;
      }

      // Ensure minimum sizes
      newWidth = Math.max(newWidth, minNodeSize);
      newHeight = Math.max(newHeight, minNodeSize);

      // Final check - if we still violate aspect ratio due to minimums, prefer width
      const finalAspectRatio = newWidth / newHeight;
      if (finalAspectRatio < minAspectRatio) {
        newWidth = newHeight * minAspectRatio;
      }

      console.log(
        `[CONSTRAINTS] Adjusted to: ${newWidth.toFixed(1)}x${newHeight.toFixed(1)} (aspect ratio: ${(newWidth / newHeight).toFixed(2)})`
      );

      return {
        ...placement,
        area: {
          ...area,
          w: newWidth,
          h: newHeight,
        },
      };
    }

    // Also enforce maximum aspect ratio (not extremely wide)
    const maxAspectRatio = 8.0;
    if (aspectRatio > maxAspectRatio) {
      console.log(
        `[CONSTRAINTS] Adjusting overly wide node: ${area.w}x${area.h} (aspect ratio: ${aspectRatio.toFixed(2)})`
      );

      const currentArea = area.w * area.h;
      let newHeight = Math.sqrt(currentArea / maxAspectRatio);
      let newWidth = newHeight * maxAspectRatio;

      // Constrain to available space
      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = newHeight * maxAspectRatio;
      }

      if (newWidth > maxWidth) {
        newWidth = maxWidth;
        newHeight = newWidth / maxAspectRatio;
      }

      return {
        ...placement,
        area: {
          ...area,
          w: Math.max(newWidth, minNodeSize),
          h: Math.max(newHeight, minNodeSize),
        },
      };
    }

    return placement; // Aspect ratio is acceptable
  };

  // Score layout based on how well it preserves value-based proportions
  const scoreLayoutForValuePreservation = (
    placements: NodePlacement[],
    totalValue: number
  ): number => {
    let totalScore = 0;
    const totalArea = placements.reduce(
      (sum, p) => sum + p.area.w * p.area.h,
      0
    );

    for (const placement of placements) {
      const nodeValue = sizeAccessor(placement.node);
      const expectedAreaRatio = nodeValue / totalValue;
      const actualAreaRatio = (placement.area.w * placement.area.h) / totalArea;

      // Score how close actual area ratio is to expected value ratio
      const ratio =
        Math.min(actualAreaRatio, expectedAreaRatio) /
        Math.max(actualAreaRatio, expectedAreaRatio);
      totalScore += ratio * nodeValue; // Weight by node value
    }

    return totalScore / totalValue;
  };

  // Validate that placement meets minimum requirements with reasonable constraints
  const validatePlacement = (
    placements: NodePlacement[],
    availableWidth: number,
    availableHeight: number
  ): boolean => {
    for (const placement of placements) {
      const { area } = placement;

      // Basic size requirements
      if (area.w < minNodeSize || area.h < minNodeSize) return false;
      if (
        area.x + area.w > availableWidth * 1.05 ||
        area.y + area.h > availableHeight * 1.05
      )
        return false; // Allow small overflow

      // Aspect ratio constraints
      const aspectRatio = area.w / area.h;

      // Enforce minimum aspect ratios for readability
      const minAspectRatio = isLeafNode(placement.node) ? 1.0 : 0.5;
      if (aspectRatio < minAspectRatio) {
        console.log(
          `[LAYOUT VALIDATION] Rejecting layout with ${isLeafNode(placement.node) ? "tall leaf" : "too tall"} node: ${area.w}x${area.h} (aspect ratio: ${aspectRatio.toFixed(2)})`
        );
        return false;
      }

      // Reject extremely wide rectangles
      if (aspectRatio > 8) {
        console.log(
          `[LAYOUT VALIDATION] Rejecting layout with extremely wide rectangle: ${area.w}x${area.h} (aspect ratio: ${aspectRatio.toFixed(2)})`
        );
        return false;
      }
    }
    return true;
  };

  // Score layout quality based on text readability
  const scoreLayoutForTextReadability = (
    placements: NodePlacement[]
  ): number => {
    let totalScore = 0;

    for (const placement of placements) {
      const { area } = placement;
      const aspectRatio = area.w / area.h;

      // Ideal aspect ratio for text is between 1.5 and 4 (wider than tall, but not too wide)
      let aspectScore;
      if (aspectRatio >= 1.5 && aspectRatio <= 4) {
        aspectScore = 1.0; // Perfect for text
      } else if (aspectRatio >= 1.0 && aspectRatio <= 6) {
        aspectScore = 0.8; // Good for text
      } else if (aspectRatio >= 0.5 && aspectRatio <= 8) {
        aspectScore = 0.5; // Acceptable
      } else {
        aspectScore = 0.1; // Poor for text
      }

      // Weight by area - larger rectangles matter more
      const weight = area.w * area.h;
      totalScore += aspectScore * weight;
    }

    return totalScore;
  };

  // Fallback proportional layout based on node values - pure bin-packing approach
  const createProportionalLayout = (
    children: ScopeNode[],
    availableWidth: number,
    availableHeight: number,
    totalValue: number
  ): NodePlacement[] => {
    const placements: NodePlacement[] = [];

    // Keep original order - don't sort by value!
    const indexedChildren = children.map((child, index) => ({
      child,
      originalIndex: index,
      value: sizeAccessor(child),
    }));

    console.log(
      `[BIN-PACKING LAYOUT] Creating value-based proportional layout for ${children.length} children`
    );

    // Start with value-based proportional sizing
    let currentX = 0;
    const initialPlacements: NodePlacement[] = [];

    for (const { child, originalIndex, value } of indexedChildren) {
      const proportion = value / totalValue;
      const width = proportion * availableWidth;

      let placement = {
        node: child,
        area: { x: currentX, y: 0, w: width, h: availableHeight },
        originalIndex,
      };

      // Apply constraints and track the original intended width
      const originalWidth = width;
      placement = applySoftConstraints(
        placement,
        availableWidth,
        availableHeight
      );
      placement.area.x = currentX; // Ensure x position is maintained

      initialPlacements.push(placement);
      currentX += originalWidth; // Use original width for spacing to maintain proportions
    }

    // Now redistribute space if there were constraint adjustments
    const totalAdjustedWidth = initialPlacements.reduce(
      (sum, p) => sum + p.area.w,
      0
    );

    if (Math.abs(totalAdjustedWidth - availableWidth) > 1) {
      console.log(
        `[BIN-PACKING LAYOUT] Redistributing space: ${totalAdjustedWidth.toFixed(1)} -> ${availableWidth}`
      );

      // Redistribute the space proportionally among all nodes
      const scale = availableWidth / totalAdjustedWidth;
      let redistributedX = 0;

      for (const placement of initialPlacements) {
        const scaledWidth = placement.area.w * scale;
        placement.area.x = redistributedX;
        placement.area.w = scaledWidth;
        redistributedX += scaledWidth;
        placements.push(placement);
      }
    } else {
      // No significant redistribution needed, just fix x positions
      let fixedX = 0;
      for (const placement of initialPlacements) {
        placement.area.x = fixedX;
        fixedX += placement.area.w;
        placements.push(placement);
      }
    }

    const finalUsedWidth = placements.reduce((sum, p) => sum + p.area.w, 0);
    console.log(
      `[BIN-PACKING LAYOUT] Completed layout using ${finalUsedWidth.toFixed(1)}/${availableWidth} width`
    );

    return placements;
  };

  // Place children in source code order within their allocated areas
  const placeChildrenInSourceOrder = (
    children: ScopeNode[],
    availableWidth: number,
    availableHeight: number,
    totalValue: number
  ): NodePlacement[] => {
    console.log(
      `[IMPROVED LAYOUT] Placing ${children.length} children with bin-packing approach`
    );

    // For bin-packing, always start with pure proportional layout
    const binPackingLayout = createProportionalLayout(
      children,
      availableWidth,
      availableHeight,
      totalValue
    );

    // Validate the bin-packing layout with relaxed constraints
    if (validatePlacement(binPackingLayout, availableWidth, availableHeight)) {
      const valueScore = scoreLayoutForValuePreservation(
        binPackingLayout,
        totalValue
      );
      console.log(
        `[IMPROVED LAYOUT] Bin-packing layout scored ${valueScore.toFixed(3)} for value preservation`
      );

      // If value preservation is good (>0.9), use it regardless of aesthetics
      if (valueScore > 0.9) {
        console.log(
          `[IMPROVED LAYOUT] Using bin-packing layout (excellent value preservation)`
        );
        return binPackingLayout;
      }
    }

    // Only try common proportions if bin-packing didn't work well
    const commonLayout = tryCommonProportions(
      children,
      availableWidth,
      availableHeight,
      totalValue
    );

    if (commonLayout) {
      const commonValueScore = scoreLayoutForValuePreservation(
        commonLayout,
        totalValue
      );
      const binPackingValueScore = scoreLayoutForValuePreservation(
        binPackingLayout,
        totalValue
      );

      console.log(
        `[IMPROVED LAYOUT] Common layout value score: ${commonValueScore.toFixed(3)}, bin-packing score: ${binPackingValueScore.toFixed(3)}`
      );

      // Only use common layout if it's significantly better at preserving values
      if (commonValueScore > binPackingValueScore * 1.1) {
        console.log(
          `[IMPROVED LAYOUT] Using common proportion layout (better value preservation)`
        );
        return commonLayout;
      }
    }

    // Fallback to bin-packing layout even if not perfect
    console.log(`[IMPROVED LAYOUT] Using bin-packing layout as fallback`);
    return binPackingLayout;
  };

  // Main recursive layout function
  function layoutRecursive(
    node: ScopeNode,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number
  ): LayoutNode {
    console.log(
      `[IMPROVED LAYOUT] Processing node "${node.label}" at depth ${depth}, size: ${width}x${height}`
    );

    const layoutNode: LayoutNode = {
      node,
      x,
      y,
      w: width,
      h: height,
      children: [],
      renderMode: getRenderMode(width, height, depth),
    };

    // If no children or too small to render, return early
    if (
      !node.children ||
      node.children.length === 0 ||
      layoutNode.renderMode === "none"
    ) {
      return layoutNode;
    }

    // Filter viable children
    const viableChildren = node.children.filter((child) => {
      const childValue = sizeAccessor(child);
      return childValue > 0;
    });

    if (viableChildren.length === 0) {
      const hiddenCount = node.children.length;
      if (hiddenCount > 0) {
        layoutNode.hasHiddenChildren = true;
        layoutNode.hiddenChildrenCount = hiddenCount;

        // Update node metadata
        const updatedNode = { ...node };
        updatedNode.meta = {
          ...updatedNode.meta,
          hasHiddenChildren: true,
          hiddenChildrenCount: hiddenCount,
          hiddenReason: "size_constraints",
        };
        layoutNode.node = updatedNode;
      }
      return layoutNode;
    }

    // Calculate header height for containers
    const hasRenderableChildren = viableChildren.length > 0;
    const shouldRenderHeader =
      hasRenderableChildren && height >= 16 && width >= 24;
    const reservedHeaderHeight = shouldRenderHeader
      ? calculateHeaderHeight(height, depth)
      : 0;

    // Apply padding
    const paddingToApply = depth > 0 ? padding : 0;
    const availableWidth = width - 2 * paddingToApply;
    const availableHeight = height - reservedHeaderHeight - 2 * paddingToApply;

    if (availableWidth < minWidth || availableHeight < minNodeSize) {
      const hiddenCount = viableChildren.length;
      if (hiddenCount > 0) {
        layoutNode.hasHiddenChildren = true;
        layoutNode.hiddenChildrenCount = hiddenCount;
      }
      return layoutNode;
    }

    const totalValue = viableChildren.reduce(
      (sum, child) => sum + sizeAccessor(child),
      0
    );
    if (totalValue === 0) return layoutNode;

    // Check if we can fit all nodes with text at this depth
    const canFitAllWithText = canFitAllNodesWithText(
      viableChildren,
      availableWidth,
      availableHeight,
      depth
    );

    console.log(
      `[IMPROVED LAYOUT] Depth ${depth}: Can fit all ${viableChildren.length} children with text: ${canFitAllWithText}`
    );

    // Apply strict depth constraint if enabled
    if (
      strictDepthConstraint &&
      depth >= maxDepthForText &&
      !canFitAllWithText
    ) {
      console.log(
        `[IMPROVED LAYOUT] Strict depth constraint applied at depth ${depth}, switching to box mode`
      );
      layoutNode.renderMode = "box";
      layoutNode.isConstrainedByDepth = true;
      return layoutNode;
    }

    // Place children in source order
    const startX = x + paddingToApply;
    const startY = y + reservedHeaderHeight + paddingToApply;

    const childPlacements = placeChildrenInSourceOrder(
      viableChildren,
      availableWidth,
      availableHeight,
      totalValue
    );

    // Process each placement
    const layoutChildren: LayoutNode[] = [];
    let hiddenChildrenCount = 0;

    for (const placement of childPlacements) {
      const childLayout = layoutRecursive(
        placement.node,
        startX + placement.area.x,
        startY + placement.area.y,
        placement.area.w,
        placement.area.h,
        depth + 1
      );

      if (childLayout.renderMode !== "none") {
        layoutChildren.push(childLayout);
      } else {
        hiddenChildrenCount++;
      }
    }

    // Track children that couldn't be placed due to space constraints
    const unplacedChildrenCount =
      viableChildren.length - childPlacements.length;
    const totalHiddenCount = hiddenChildrenCount + unplacedChildrenCount;

    if (totalHiddenCount > 0) {
      layoutNode.hasHiddenChildren = true;
      layoutNode.hiddenChildrenCount = totalHiddenCount;

      // Update node metadata
      const updatedNode = { ...layoutNode.node };
      updatedNode.meta = {
        ...updatedNode.meta,
        hasHiddenChildren: true,
        hiddenChildrenCount: totalHiddenCount,
        hiddenReason: "layout_constraints",
      };
      layoutNode.node = updatedNode;
    }

    layoutNode.children = layoutChildren;

    console.log(
      `[IMPROVED LAYOUT] Completed node "${node.label}": placed ${layoutChildren.length} children, hidden ${totalHiddenCount}`
    );

    return layoutNode;
  }

  return layoutRecursive(root, 0, 0, w, h, 0);
};
