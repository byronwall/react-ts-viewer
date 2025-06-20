import React, { useMemo } from "react";
import type { ScopeNode } from "../../types";
import { NodeCategory } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { getContrastingTextColor } from "./getContrastingTextColor";
import { getDynamicNodeDisplayLabel } from "./getDynamicNodeDisplayLabel";
import {
  HierarchicalLayoutFn,
  HierarchicalLayoutNode,
  HierarchicalLayoutOptions,
  layoutHierarchical,
} from "./layoutHierarchical";

import { pastelSet } from "./pastelSet";

// Stylesheet for treemap animations
const treemapStyles = `
  .treemap-container {
    transition: transform 500ms ease-in-out;
  }
  
  .treemap-leaf {
    transition: transform 500ms ease-in-out;
  }
`;

/* ---------- utility functions ------------ */

// Function to lighten a hex color by a percentage
const lightenColor = (hex: string, percent: number): string => {
  // Remove the hash if present
  const cleanHex = hex.replace("#", "");

  // Parse the hex color
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);

  // Lighten each component
  const lightenComponent = (component: number) => {
    return Math.min(
      255,
      Math.round(component + (255 - component) * (percent / 100))
    );
  };

  const newR = lightenComponent(r);
  const newG = lightenComponent(g);
  const newB = lightenComponent(b);

  // Convert back to hex
  const toHex = (component: number) => component.toString(16).padStart(2, "0");

  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
};

/* ---------- flat rendering system ------------ */

interface FlatContainerNode {
  id: string;
  node: ScopeNode;
  x: number; // Absolute position
  y: number; // Absolute position
  w: number;
  h: number;
  headerHeight: number;
  depth: number;
  renderOrder: number;
  // Styling properties
  color: string;
  borderColor: string;
  strokeWidth: number;
  opacity: number;
  groupBorderColor: string;
  groupStrokeWidth: number;
  groupOpacity: number;
  groupFillColor: string;
  // Interaction flags
  isSelected: boolean;
  isSearchMatch: boolean;
  // Text properties
  displayLabel: string;
  fontSize: number;
  textColor: string;
  shouldShowLabel: boolean;
  // Indicators
  hasUnrenderedChildren: boolean;
  unrenderedCount: number;
  hasHiddenChildren: boolean;
  hiddenChildrenCount: number;
}

interface FlatLeafNode {
  id: string;
  node: ScopeNode;
  x: number; // Absolute position
  y: number; // Absolute position
  w: number;
  h: number;
  depth: number;
  renderOrder: number;
  // Styling properties
  color: string;
  borderColor: string;
  strokeWidth: number;
  opacity: number;
  // Interaction flags
  isSelected: boolean;
  isSearchMatch: boolean;
  // Text properties
  displayLabel: string;
  fontSize: number;
  textColor: string;
  shouldShowLabel: boolean;
  // Indicators
  hasUnrenderedChildren: boolean;
  unrenderedCount: number;
  hasHiddenChildren: boolean;
  hiddenChildrenCount: number;
}

// Helper function to detect unrendered children (moved from existing code)
const hasUnrenderedChildrenHelper = (
  originalNode: ScopeNode,
  layoutNode: AnyLayoutNode
): { hasUnrendered: boolean; unrenderedCount: number } => {
  const originalChildrenCount = originalNode.children?.length || 0;
  const renderedChildrenCount = layoutNode.children?.length || 0;

  return {
    hasUnrendered: originalChildrenCount > renderedChildrenCount,
    unrenderedCount: originalChildrenCount - renderedChildrenCount,
  };
};

const collectAllNodes = (
  layoutRoot: AnyLayoutNode,
  settings: TreemapSettings,
  matchingNodes: Set<string>,
  selectedNodeId: string | undefined,
  minFontSize: number,
  maxFontSize: number,
  layoutOptions: any
): { containers: FlatContainerNode[]; leaves: FlatLeafNode[] } => {
  const containers: FlatContainerNode[] = [];
  const leaves: FlatLeafNode[] = [];

  // Collect nodes by depth level first (breadth-first)
  const nodesByDepth: Array<Array<{ node: AnyLayoutNode; depth: number }>> = [];

  const collectByDepth = (ln: AnyLayoutNode, depth = 0) => {
    // Skip rendering if the node is too small or marked as 'none'
    if (ln.w < 2 || ln.h < 2 || ln.renderMode === "none") {
      return;
    }

    // Ensure we have an array for this depth level
    if (!nodesByDepth[depth]) {
      nodesByDepth[depth] = [];
    }

    // Add this node to its depth level
    nodesByDepth[depth].push({ node: ln, depth });

    // Recursively collect children
    if (ln.children) {
      for (const child of ln.children) {
        collectByDepth(child as AnyLayoutNode, depth + 1);
      }
    }
  };

  // First pass: collect all nodes by depth
  collectByDepth(layoutRoot);

  // Second pass: process nodes level by level, containers first within each level
  let renderOrder = 0;

  for (let depthLevel = 0; depthLevel < nodesByDepth.length; depthLevel++) {
    const nodesAtThisDepth = nodesByDepth[depthLevel];
    if (!nodesAtThisDepth) continue;

    // Separate containers and leaves at this depth
    const containersAtDepth: Array<{ node: AnyLayoutNode; depth: number }> = [];
    const leavesAtDepth: Array<{ node: AnyLayoutNode; depth: number }> = [];

    for (const { node: ln, depth } of nodesAtThisDepth) {
      const hasRenderableChildren = ln.children && ln.children.length > 0;
      const isActuallyContainer = hasRenderableChildren;

      if (ln.renderMode === "box") {
        leavesAtDepth.push({ node: ln, depth });
      } else if (isActuallyContainer) {
        containersAtDepth.push({ node: ln, depth });
      } else {
        leavesAtDepth.push({ node: ln, depth });
      }
    }

    // Process containers first at this depth level
    for (const { node: ln, depth } of containersAtDepth) {
      const currentRenderOrder = renderOrder++;

      // Common properties
      const category = ln.node.category;
      const baseColor = pastelSet[category] || pastelSet[NodeCategory.Other];
      const isSelected = selectedNodeId === ln.node.id;
      const isSearchMatch = matchingNodes.has(ln.node.id);

      // Get unrendered children info
      const unrenderedInfo = hasUnrenderedChildrenHelper(ln.node, ln);

      // Get hidden children info
      const meta = (ln.node as any).meta || {};
      const hasHiddenChildren =
        meta.hasHiddenChildren === true ||
        (ln.node as any).hasHiddenChildren === true;
      const hiddenChildrenCount =
        meta.hiddenChildrenCount || (ln.node as any).hiddenChildrenCount || 0;

      // Container node processing
      const headerHeight = Math.min(layoutOptions.headerHeight, ln.h);

      // Container border styling
      let groupBorderColor = "#6c757d";
      let groupStrokeWidth = Math.max(0.5, 1.5 - depth * 0.2);
      let groupOpacity = Math.max(0.3, 0.6 - depth * 0.1);

      if (isSelected) {
        groupBorderColor = "red";
        groupStrokeWidth = Math.max(2, 3 - depth * 0.3);
        groupOpacity = 0.8;
      } else if (isSearchMatch) {
        groupBorderColor = "#FFD700";
        groupStrokeWidth = Math.max(1, 2 - depth * 0.2);
        groupOpacity = 0.7;
      } else if (depth === 1) {
        groupBorderColor = "#6c757d";
      } else {
        groupBorderColor = "#adb5bd";
      }

      const groupFillColor = lightenColor(baseColor, 30);

      // Header styling
      const color = baseColor;
      let borderColor = "#333333";
      let strokeWidth = 0.5;

      if (unrenderedInfo.hasUnrendered) {
        borderColor = "#FF0000";
        strokeWidth = 3;
      } else if (isSelected) {
        borderColor = "#cc0000";
        strokeWidth = 2;
      } else if (isSearchMatch) {
        borderColor = "#ccaa00";
        strokeWidth = 1.5;
      }

      const opacity = Math.max(0.8, 1 - depth * 0.02);

      // Calculate font size for header
      const depthAdjustedMin = Math.max(8, minFontSize - 4 - depth * 1.5);
      const heightBasedSize = headerHeight * 0.55;
      const fontSize = Math.min(
        maxFontSize,
        Math.max(depthAdjustedMin, heightBasedSize)
      );

      const actualCharWidth = fontSize * 0.5;
      const indicatorSize = Math.min(12, headerHeight * 0.4, fontSize * 0.8);
      const totalIndicatorSpace =
        (hasHiddenChildren ? indicatorSize + 4 : 0) +
        (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0);

      const textPaddingLeft = 4;
      const textPaddingRight = 2 + totalIndicatorSpace;
      const availableTextWidth = Math.max(
        0,
        ln.w - textPaddingLeft - textPaddingRight
      );

      const displayLabel = getDynamicNodeDisplayLabel(
        {
          data: ln.node,
          width: availableTextWidth,
          height: headerHeight,
        },
        { ...settings, avgCharPixelWidth: actualCharWidth }
      );

      const shouldShowLabel =
        settings.enableLabel && displayLabel && ln.w >= 20 && headerHeight >= 8;

      containers.push({
        id: ln.node.id,
        node: ln.node,
        x: ln.x,
        y: ln.y,
        w: ln.w,
        h: ln.h,
        headerHeight,
        depth,
        renderOrder: currentRenderOrder,
        color,
        borderColor,
        strokeWidth,
        opacity,
        groupBorderColor,
        groupStrokeWidth,
        groupOpacity,
        groupFillColor,
        isSelected,
        isSearchMatch,
        displayLabel: displayLabel || "",
        fontSize,
        textColor: getContrastingTextColor(color),
        shouldShowLabel: Boolean(shouldShowLabel),
        hasUnrenderedChildren: unrenderedInfo.hasUnrendered,
        unrenderedCount: unrenderedInfo.unrenderedCount,
        hasHiddenChildren,
        hiddenChildrenCount,
      });
    }

    // Then process leaves at this depth level
    for (const { node: ln, depth } of leavesAtDepth) {
      const currentRenderOrder = renderOrder++;

      // Common properties
      const category = ln.node.category;
      const baseColor = pastelSet[category] || pastelSet[NodeCategory.Other];
      const isSelected = selectedNodeId === ln.node.id;
      const isSearchMatch = matchingNodes.has(ln.node.id);

      // Get unrendered children info
      const unrenderedInfo = hasUnrenderedChildrenHelper(ln.node, ln);

      // Get hidden children info
      const meta = (ln.node as any).meta || {};
      const hasHiddenChildren =
        meta.hasHiddenChildren === true ||
        (ln.node as any).hasHiddenChildren === true;
      const hiddenChildrenCount =
        meta.hiddenChildrenCount || (ln.node as any).hiddenChildrenCount || 0;

      if (ln.renderMode === "box") {
        // Box mode - treat as leaf with special styling
        const isContainerBox = (ln as HierarchicalLayoutNode).isContainer;

        let borderColor = "#6c757d";
        let strokeWidth = 1;

        if (isContainerBox) {
          strokeWidth = 3;
          borderColor = "#2c3e50";
        }

        if (isSelected) {
          borderColor = "red";
          strokeWidth = isContainerBox ? 4 : 2;
        } else if (isSearchMatch) {
          borderColor = "#FFD700";
          strokeWidth = isContainerBox ? 3.5 : 1.5;
        }

        leaves.push({
          id: ln.node.id,
          node: ln.node,
          x: ln.x,
          y: ln.y,
          w: ln.w,
          h: ln.h,
          depth,
          renderOrder: currentRenderOrder,
          color: baseColor,
          borderColor,
          strokeWidth,
          opacity: isContainerBox ? 0.8 : 0.7,
          isSelected,
          isSearchMatch,
          displayLabel: "", // Box mode doesn't show text
          fontSize: 0,
          textColor: "",
          shouldShowLabel: false,
          hasUnrenderedChildren: false,
          unrenderedCount: 0,
          hasHiddenChildren: Boolean(isContainerBox),
          hiddenChildrenCount: 0,
        });
      } else {
        // Leaf node
        let borderColor = "#555555";
        let strokeWidth = Math.max(0.5, settings.borderWidth - depth * 0.1);

        if (unrenderedInfo.hasUnrendered) {
          borderColor = "#FF0000";
          strokeWidth = 4;
        } else if (isSelected) {
          borderColor = "red";
          strokeWidth = Math.max(1, settings.borderWidth + 1 - depth * 0.2);
        } else if (isSearchMatch) {
          borderColor = "#FFD700";
          strokeWidth = Math.max(0.8, settings.borderWidth + 0.5 - depth * 0.1);
        }

        const opacity = Math.max(0.6, settings.nodeOpacity - depth * 0.02);

        // Calculate font size for leaf
        const depthAdjustedMin = Math.max(
          minFontSize,
          minFontSize + 6 - depth * 1.5
        );
        const heightBasedSize = ln.h * 0.6;
        const fontSize = Math.min(
          maxFontSize,
          Math.max(depthAdjustedMin, heightBasedSize)
        );

        const actualCharWidth = fontSize * 0.5;
        const indicatorSize = Math.min(10, ln.h * 0.3, fontSize * 0.7);
        const totalIndicatorMargin =
          (hasHiddenChildren ? indicatorSize + 2 : 0) +
          (unrenderedInfo.hasUnrendered ? indicatorSize + 2 : 0);

        const textMargin = 4;
        const availableTextWidth = Math.max(
          0,
          ln.w - 2 * textMargin - totalIndicatorMargin
        );

        const displayLabel = getDynamicNodeDisplayLabel(
          { data: ln.node, width: availableTextWidth, height: ln.h },
          { ...settings, avgCharPixelWidth: actualCharWidth }
        );

        const shouldShowLabel =
          settings.enableLabel &&
          displayLabel &&
          ln.h >= Math.max(settings.minLabelHeight, fontSize + 4) &&
          ln.w >= fontSize * 2;

        leaves.push({
          id: ln.node.id,
          node: ln.node,
          x: ln.x,
          y: ln.y,
          w: ln.w,
          h: ln.h,
          depth,
          renderOrder: currentRenderOrder,
          color: baseColor,
          borderColor,
          strokeWidth,
          opacity,
          isSelected,
          isSearchMatch,
          displayLabel: displayLabel || "",
          fontSize,
          textColor: getContrastingTextColor(baseColor),
          shouldShowLabel: Boolean(shouldShowLabel),
          hasUnrenderedChildren: unrenderedInfo.hasUnrendered,
          unrenderedCount: unrenderedInfo.unrenderedCount,
          hasHiddenChildren,
          hiddenChildrenCount,
        });
      }
    }
  }

  return { containers, leaves };
};

// React component for container nodes
interface ContainerNodeProps {
  container: FlatContainerNode;
  onNodeClick: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseEnter: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseLeave: () => void;
  /**
   * Optional callback fired once per render to inform parent components
   * of the container rectangle (after layout, before viewport transform).
   */
  onNodeLayout?: (
    id: string,
    rect: { x: number; y: number; w: number; h: number }
  ) => void;
}

const ContainerNode: React.FC<ContainerNodeProps> = ({
  container,
  onNodeClick,
  onMouseEnter,
  onMouseLeave,
  onNodeLayout,
}) => {
  const {
    id,
    node,
    x,
    y,
    w,
    h,
    headerHeight,
    color,
    borderColor,
    strokeWidth,
    opacity,
    groupBorderColor,
    groupStrokeWidth,
    groupOpacity,
    groupFillColor,
    displayLabel,
    fontSize,
    textColor,
    shouldShowLabel,
    hasUnrenderedChildren,
    unrenderedCount,
    hasHiddenChildren,
    hiddenChildrenCount,
  } = container;

  const indicatorSize = Math.min(12, headerHeight * 0.4, fontSize * 0.8);
  const textY = Math.min(headerHeight - 2, fontSize + 2);

  // Report layout on every render (cheap and keeps things in sync)
  React.useEffect(() => {
    onNodeLayout?.(node.id, { x, y, w, h });
  }, [onNodeLayout, node.id, x, y, w, h]);

  return (
    <g
      key={id}
      transform={`translate(${x}, ${y})`}
      className="treemap-container"
    >
      {/* Container background */}
      <rect
        x={0}
        y={headerHeight}
        width={w}
        height={h - headerHeight}
        fill={groupFillColor}
        stroke={groupBorderColor}
        strokeWidth={groupStrokeWidth}
        opacity={groupOpacity}
        rx={Math.max(2, 4 - container.depth * 0.5)}
        style={{ cursor: "pointer" }}
        onClick={(e) => onNodeClick(node, e as any)}
        onMouseEnter={(e) => onMouseEnter(node, e as any)}
        onMouseLeave={onMouseLeave}
      />
      {/* Header background */}
      <rect
        x={0}
        y={0}
        width={w}
        height={headerHeight}
        fill={color}
        stroke={borderColor}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={{ cursor: "pointer" }}
        onClick={(e) => onNodeClick(node, e as any)}
        onMouseEnter={(e) => onMouseEnter(node, e as any)}
        onMouseLeave={onMouseLeave}
      />
      {/* Header text */}
      {shouldShowLabel && displayLabel && (
        <text
          x={4}
          y={textY}
          fontSize={fontSize}
          fill={textColor}
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {displayLabel}
        </text>
      )}
      {/* Unrendered children indicator */}
      {hasUnrenderedChildren && w >= 24 && headerHeight >= 16 && (
        <g>
          <circle
            cx={w - indicatorSize / 2 - 2}
            cy={headerHeight / 2}
            r={indicatorSize / 2}
            fill="rgba(255, 0, 0, 0.9)"
            stroke="rgba(0, 0, 0, 0.8)"
            strokeWidth={1}
          />
          <text
            x={w - indicatorSize / 2 - 2}
            y={headerHeight / 2}
            fontSize={Math.min(indicatorSize * 0.7, 10)}
            fill="#FFF"
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ userSelect: "none", fontWeight: "bold" }}
          >
            !
          </text>
          {w >= 40 && headerHeight >= 20 && (
            <text
              x={w - indicatorSize / 2 - 2}
              y={headerHeight / 2 + indicatorSize / 2 + 2}
              fontSize={Math.min(6, indicatorSize * 0.4)}
              fill={textColor}
              textAnchor="middle"
              dominantBaseline="hanging"
              pointerEvents="none"
              style={{ userSelect: "none" }}
            >
              -{unrenderedCount}
            </text>
          )}
        </g>
      )}
      {/* Hidden children indicator */}
      {hasHiddenChildren && w >= 24 && headerHeight >= 16 && (
        <g>
          <circle
            cx={
              w -
              indicatorSize / 2 -
              2 -
              (hasUnrenderedChildren ? indicatorSize + 4 : 0)
            }
            cy={headerHeight / 2}
            r={indicatorSize / 2}
            fill="rgba(255, 165, 0, 0.8)"
            stroke="rgba(0, 0, 0, 0.6)"
            strokeWidth={0.5}
          />
          <text
            x={
              w -
              indicatorSize / 2 -
              2 -
              (hasUnrenderedChildren ? indicatorSize + 4 : 0)
            }
            y={headerHeight / 2}
            fontSize={Math.min(indicatorSize * 0.6, 8)}
            fill="#000"
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ userSelect: "none", fontWeight: "bold" }}
          >
            ⋯
          </text>
          {w >= 60 && headerHeight >= 20 && (
            <text
              x={
                w -
                indicatorSize / 2 -
                2 -
                (hasUnrenderedChildren ? indicatorSize + 4 : 0)
              }
              y={headerHeight / 2 + indicatorSize / 2 + 2}
              fontSize={Math.min(6, indicatorSize * 0.4)}
              fill={textColor}
              textAnchor="middle"
              dominantBaseline="hanging"
              pointerEvents="none"
              style={{ userSelect: "none" }}
            >
              +{hiddenChildrenCount}
            </text>
          )}
        </g>
      )}
    </g>
  );
};

// React component for leaf nodes
interface LeafNodeProps {
  leaf: FlatLeafNode;
  onNodeClick: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseEnter: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onNodeLayout?: (
    id: string,
    rect: { x: number; y: number; w: number; h: number }
  ) => void;
}

const LeafNode: React.FC<LeafNodeProps> = ({
  leaf,
  onNodeClick,
  onMouseEnter,
  onMouseLeave,
  onNodeLayout,
}) => {
  const {
    id,
    node,
    x,
    y,
    w,
    h,
    color,
    borderColor,
    strokeWidth,
    opacity,
    displayLabel,
    fontSize,
    textColor,
    shouldShowLabel,
    hasUnrenderedChildren,
    unrenderedCount,
    hasHiddenChildren,
    hiddenChildrenCount,
  } = leaf;

  const indicatorSize = Math.min(10, h * 0.3, fontSize * 0.7);

  React.useEffect(() => {
    onNodeLayout?.(node.id, { x, y, w, h });
  }, [onNodeLayout, node.id, x, y, w, h]);

  // Handle special styling for box mode (collapsed containers)
  if (!shouldShowLabel && fontSize === 0) {
    // This is a box mode node
    return (
      <g key={id} transform={`translate(${x}, ${y})`} className="treemap-leaf">
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill={color}
          stroke={borderColor}
          strokeWidth={strokeWidth}
          opacity={opacity}
          rx={2}
          style={{ cursor: "pointer" }}
          onClick={(e) => onNodeClick(node, e as any)}
          onMouseEnter={(e) => onMouseEnter(node, e as any)}
          onMouseLeave={onMouseLeave}
        />
        {/* Collapsed indicator for container boxes */}
        {hasHiddenChildren && w >= 16 && h >= 16 && (
          <g>
            <circle
              cx={w / 2}
              cy={h / 2}
              r={Math.min(w, h) * 0.15}
              fill="rgba(44, 62, 80, 0.8)"
              stroke="white"
              strokeWidth={1}
            />
            <text
              x={w / 2}
              y={h / 2}
              fontSize={Math.min(w, h) * 0.2}
              fill="white"
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              style={{ userSelect: "none", fontWeight: "bold" }}
            >
              ⊞
            </text>
          </g>
        )}
      </g>
    );
  }

  // Regular leaf node
  return (
    <g key={id} transform={`translate(${x}, ${y})`} className="treemap-leaf">
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill={color}
        stroke={borderColor}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={{ cursor: "pointer" }}
        onClick={(e) => onNodeClick(node, e as any)}
        onMouseEnter={(e) => onMouseEnter(node, e as any)}
        onMouseLeave={onMouseLeave}
      />
      {shouldShowLabel && (
        <text
          x={w / 2}
          y={h / 2}
          fontSize={fontSize}
          fill={textColor}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {displayLabel}
        </text>
      )}
      {/* Unrendered children indicator */}
      {hasUnrenderedChildren && w >= 20 && h >= 16 && (
        <g>
          <circle
            cx={w - indicatorSize / 2 - 2}
            cy={indicatorSize / 2 + 2}
            r={indicatorSize / 2}
            fill="rgba(255, 0, 0, 0.95)"
            stroke="rgba(0, 0, 0, 0.8)"
            strokeWidth={0.5}
          />
          <text
            x={w - indicatorSize / 2 - 2}
            y={indicatorSize / 2 + 2}
            fontSize={Math.min(indicatorSize * 0.7, 8)}
            fill="#FFF"
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ userSelect: "none", fontWeight: "bold" }}
          >
            !
          </text>
          {w >= 30 && h >= 24 && (
            <text
              x={w - indicatorSize / 2 - 2}
              y={indicatorSize + 4}
              fontSize={Math.min(5, indicatorSize * 0.3)}
              fill={textColor}
              textAnchor="middle"
              dominantBaseline="hanging"
              pointerEvents="none"
              style={{ userSelect: "none" }}
            >
              -{unrenderedCount}
            </text>
          )}
        </g>
      )}
      {/* Hidden children indicator */}
      {hasHiddenChildren && w >= 20 && h >= 16 && (
        <g>
          <circle
            cx={w - indicatorSize / 2 - 2}
            cy={
              indicatorSize / 2 +
              2 +
              (hasUnrenderedChildren ? indicatorSize + 4 : 0)
            }
            r={indicatorSize / 2}
            fill="rgba(255, 165, 0, 0.9)"
            stroke="rgba(0, 0, 0, 0.7)"
            strokeWidth={0.3}
          />
          <text
            x={w - indicatorSize / 2 - 2}
            y={
              indicatorSize / 2 +
              2 +
              (hasUnrenderedChildren ? indicatorSize + 4 : 0)
            }
            fontSize={Math.min(indicatorSize * 0.6, 6)}
            fill="#000"
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ userSelect: "none", fontWeight: "bold" }}
          >
            ⋯
          </text>
          {w >= 30 && h >= 40 && (
            <text
              x={w - indicatorSize / 2 - 2}
              y={
                indicatorSize +
                4 +
                (hasUnrenderedChildren ? indicatorSize + 4 : 0)
              }
              fontSize={Math.min(5, indicatorSize * 0.3)}
              fill={textColor}
              textAnchor="middle"
              dominantBaseline="hanging"
              pointerEvents="none"
              style={{ userSelect: "none" }}
            >
              +{hiddenChildrenCount}
            </text>
          )}
        </g>
      )}
    </g>
  );
};

// React component for free rectangles debug visualization
interface FreeRectanglesProps {
  freeRects: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    containerPath: string;
  }>;
}

const FreeRectangles: React.FC<FreeRectanglesProps> = ({ freeRects }) => {
  return (
    <>
      {freeRects.map((rect, index) => (
        <g key={`free-rect-${index}`}>
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            fill="rgba(255, 0, 0, 0.1)" // Semi-transparent red
            stroke="rgba(255, 0, 0, 0.8)" // Red border
            strokeWidth="1"
            strokeDasharray="4,2" // Dashed border
            pointerEvents="none" // Don't interfere with clicks
          />
          {/* Add a small label if the rectangle is large enough */}
          {rect.w > 30 && rect.h > 20 && (
            <text
              x={rect.x + 2}
              y={rect.y + 12}
              fontSize="8"
              fill="rgba(255, 0, 0, 0.8)"
              pointerEvents="none"
              style={{
                userSelect: "none",
                fontFamily: "monospace",
              }}
            >
              FREE
            </text>
          )}
        </g>
      ))}
    </>
  );
};

/* ---------- type definitions ------------ */

type AnyLayoutNode = HierarchicalLayoutNode;

export type AnyLayoutFn = HierarchicalLayoutFn;

// View mode types
type ViewMode = "treemap" | "referenceGraph";

interface TreemapSVGProps {
  root: ScopeNode;
  width: number;
  height: number;
  layout?: AnyLayoutFn;
  padding?: number;
  minFontSize?: number;
  maxFontSize?: number;
  // Props for rendering logic
  settings: TreemapSettings;
  matchingNodes?: Set<string>;
  selectedNodeId?: string;
  onNodeClick?: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseEnter?: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseLeave?: () => void;
  // New props for reference graph mode
  viewMode?: ViewMode;
  originalFocusNodeId?: string;
  /** receives absolute (pre-viewport) rects for every rendered node */
  onNodeLayout?: (
    id: string,
    rect: { x: number; y: number; w: number; h: number }
  ) => void;
}

/* ---------- component ------------ */

// Internal component that renders just the treemap content without the outer SVG wrapper
export const TreemapContent: React.FC<TreemapSVGProps> = ({
  root,
  width,
  height,
  layout = layoutHierarchical,
  padding = 4,
  minFontSize = 12,
  maxFontSize = 16,
  settings,
  matchingNodes = new Set(),
  selectedNodeId,
  onNodeClick = () => {},
  onMouseEnter = () => {},
  onMouseLeave = () => {},
  onNodeLayout,
  viewMode = "treemap",

  originalFocusNodeId,
}) => {
  // Determine which layout options to use based on the layout function
  const layoutOptions = useMemo(() => {
    return {
      headerHeight: settings.hierarchicalHeaderHeight,
      padding: settings.hierarchicalPadding,
      leafMinWidth: settings.hierarchicalLeafMinWidth,
      leafMinHeight: settings.hierarchicalLeafMinHeight,
      leafPrefWidth: settings.hierarchicalLeafPrefWidth,
      leafPrefHeight: settings.hierarchicalLeafPrefHeight,
      leafMinAspectRatio: settings.hierarchicalLeafMinAspectRatio,
      leafMaxAspectRatio: settings.hierarchicalLeafMaxAspectRatio,
    } as HierarchicalLayoutOptions;
  }, [layout, settings, padding]);

  const layoutRoot = useMemo(() => {
    return layout(root, width, height, layoutOptions as any);
  }, [root, width, height, layout, layoutOptions]);

  // Collect flat nodes for rendering
  const { containers, leaves } = useMemo(() => {
    return collectAllNodes(
      layoutRoot as AnyLayoutNode,
      settings,
      matchingNodes,
      selectedNodeId,
      minFontSize,
      maxFontSize,
      layoutOptions
    );
  }, [
    layoutRoot,
    settings,
    matchingNodes,
    selectedNodeId,
    minFontSize,
    maxFontSize,
    layoutOptions,
  ]);

  /* collect all free rectangles from the layout tree for debugging visualization */
  const collectAllFreeRectangles = (
    layoutNode: AnyLayoutNode
  ): Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    containerPath: string;
  }> => {
    const allFreeRects: Array<{
      x: number;
      y: number;
      w: number;
      h: number;
      containerPath: string;
    }> = [];

    // Check if this is a terminal container (has children but no child containers)
    const isTerminalContainer = (() => {
      if (!layoutNode.children || layoutNode.children.length === 0) {
        return false; // No children at all, not a container
      }

      // Check if any children are containers
      const hasChildContainers = layoutNode.children.some((child) => {
        const childNode = child as AnyLayoutNode;
        return (
          (childNode as HierarchicalLayoutNode).isContainer ||
          (childNode.children && childNode.children.length > 0)
        );
      });

      return !hasChildContainers; // Terminal if it has children but no child containers
    })();

    // Only add free rectangles from terminal containers
    if (isTerminalContainer) {
      const freeRects = (layoutNode as HierarchicalLayoutNode).freeRectangles;
      if (freeRects && Array.isArray(freeRects)) {
        allFreeRects.push(...freeRects);
      }
    }

    // Always recursively collect from children to find terminal containers deeper in the tree
    if (layoutNode.children) {
      for (const child of layoutNode.children) {
        allFreeRects.push(...collectAllFreeRectangles(child as AnyLayoutNode));
      }
    }

    return allFreeRects;
  };

  // Helper function to build ScopeNode map for ELK renderer
  const buildScopeNodeMap = (
    node: ScopeNode,
    map = new Map<string, ScopeNode>()
  ): Map<string, ScopeNode> => {
    map.set(node.id, node);
    if (node.children) {
      node.children.forEach((child) => buildScopeNodeMap(child, map));
    }
    return map;
  };

  // Default treemap rendering

  // Combine all nodes and sort by render order for breadth-first rendering
  const allNodes = [
    ...containers.map((c) => ({ type: "container" as const, node: c })),
    ...leaves.map((l) => ({ type: "leaf" as const, node: l })),
  ].sort((a, b) => a.node.renderOrder - b.node.renderOrder);

  return (
    <>
      {/* Stylesheet for transitions */}
      <defs>
        <style>{treemapStyles}</style>
      </defs>

      {/* Render all nodes in breadth-first order */}
      {allNodes.map(({ type, node }) =>
        type === "container" ? (
          <ContainerNode
            key={node.id}
            container={node}
            onNodeClick={onNodeClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onNodeLayout={onNodeLayout}
          />
        ) : (
          <LeafNode
            key={node.id}
            leaf={node}
            onNodeClick={onNodeClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onNodeLayout={onNodeLayout}
          />
        )
      )}

      {/* Debug elements last */}
      {settings.showDebugFreeRectangles && (
        <FreeRectangles
          freeRects={collectAllFreeRectangles(layoutRoot as AnyLayoutNode)}
        />
      )}
    </>
  );
};
