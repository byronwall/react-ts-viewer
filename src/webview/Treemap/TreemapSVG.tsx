import React, { useMemo } from "react";
import type { ScopeNode } from "../../types";
import { NodeCategory } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { getContrastingTextColor } from "./getContrastingTextColor";
import { getDynamicNodeDisplayLabel } from "./getDynamicNodeDisplayLabel";
import {
  geminiLayout,
  GeminiLayoutFn,
  GeminiLayoutNode,
  GeminiLayoutOptions,
} from "./layoutGemini";
import {
  HierarchicalLayoutFn,
  HierarchicalLayoutNode,
  HierarchicalLayoutOptions,
  layoutHierarchical,
} from "./layoutHierarchical";
import {
  binaryLayout,
  BinaryLayoutFn,
  BinaryLayoutNode,
  BinaryLayoutOptions,
} from "./layoutSmarter";
import { pastelSet } from "./pastelSet";

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

/* ---------- render-time props ------------ */

export interface RenderNodeProps {
  node: ScopeNode;
  w: number;
  h: number;
  depth: number;
}

export interface RenderHeaderProps extends RenderNodeProps {
  depth: number;
}

// Allow BinaryLayoutNode, GeminiLayoutNode, or HierarchicalLayoutNode
export type AnyLayoutNode =
  | BinaryLayoutNode
  | GeminiLayoutNode
  | HierarchicalLayoutNode;

export type AnyLayoutOptions =
  | BinaryLayoutOptions
  | GeminiLayoutOptions
  | HierarchicalLayoutOptions;

export type AnyLayoutFn =
  | BinaryLayoutFn
  | GeminiLayoutFn
  | HierarchicalLayoutFn;

export interface TreemapSVGProps {
  root: ScopeNode;
  width: number;
  height: number;
  layout?: AnyLayoutFn;
  renderNode?: (p: RenderNodeProps) => React.ReactNode;
  renderHeader?: (p: RenderHeaderProps) => React.ReactNode;
  padding?: number;
  minFontSize?: number;
  maxFontSize?: number;
  // New props for rendering logic
  settings: TreemapSettings;
  matchingNodes?: Set<string>;
  selectedNodeId?: string;
  onNodeClick?: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseEnter?: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseLeave?: () => void;
}

/* ---------- defaults ------------ */

// Helper function to detect unrendered children
const hasUnrenderedChildren = (
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

// Create rendering functions that use the full styling logic
const createStyledRenderHeader =
  (
    settings: TreemapSettings,
    matchingNodes: Set<string>,
    selectedNodeId: string | undefined,
    onNodeClick: (node: ScopeNode, event: React.MouseEvent) => void,
    onMouseEnter: (node: ScopeNode, event: React.MouseEvent) => void,
    onMouseLeave: () => void,
    minFontSize: number,
    maxFontSize: number,
    layoutRoot: AnyLayoutNode
  ): Required<TreemapSVGProps>["renderHeader"] =>
  ({ node, w, h, depth }) => {
    const category = node.category;
    const color = pastelSet[category] || pastelSet[NodeCategory.Other];

    // Check if this node is selected or matches search
    const isSelected = selectedNodeId === node.id;
    const isSearchMatch = matchingNodes.has(node.id);

    // Find the corresponding layout node to check for unrendered children
    const findLayoutNode = (
      ln: AnyLayoutNode,
      nodeId: string
    ): AnyLayoutNode | null => {
      if (ln.node.id === nodeId) return ln;
      if (ln.children) {
        for (const child of ln.children) {
          const found = findLayoutNode(child as AnyLayoutNode, nodeId);
          if (found) return found;
        }
      }
      return null;
    };

    const layoutNode = findLayoutNode(layoutRoot, node.id);
    const unrenderedInfo = layoutNode
      ? hasUnrenderedChildren(node, layoutNode)
      : { hasUnrendered: false, unrenderedCount: 0 };

    // Check if this node has hidden children
    const meta = (node as any).meta || {};
    const hasHiddenChildren =
      meta.hasHiddenChildren === true ||
      (node as any).hasHiddenChildren === true;
    const hiddenChildrenCount =
      meta.hiddenChildrenCount || (node as any).hiddenChildrenCount || 0;

    // Determine border styling - prioritize unrendered children indicator
    let borderColor = "#333333";
    let strokeWidth = 0.5;

    if (unrenderedInfo.hasUnrendered) {
      borderColor = "#FF0000"; // Bright red for unrendered children
      strokeWidth = 3; // Thick border
    } else if (isSelected) {
      borderColor = "#cc0000"; // Darker red for selected
      strokeWidth = 2;
    } else if (isSearchMatch) {
      borderColor = "#ccaa00"; // Darker gold for search match
      strokeWidth = 1.5;
    }

    const opacity = Math.max(0.8, 1 - depth * 0.02);

    // Calculate font size with proper constraints
    const depthAdjustedMin = Math.max(
      8, // Use smaller minimum font size for headers
      minFontSize - 4 - depth * 1.5
    );
    const heightBasedSize = h * 0.55; // Reduce from 0.7 to 0.55 for tighter fit
    const fontSize = Math.min(
      maxFontSize,
      Math.max(depthAdjustedMin, heightBasedSize)
    );

    const textY = Math.min(h - 2, fontSize + 2);

    // Use the calculated fontSize for character width to ensure consistency
    const actualCharWidth = fontSize * 0.5;

    // Calculate space needed for indicators
    const indicatorSize = Math.min(12, h * 0.4, fontSize * 0.8);
    const totalIndicatorSpace =
      (hasHiddenChildren ? indicatorSize + 4 : 0) +
      (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0);

    // Reduce padding to allow more text space
    const textPaddingLeft = 4;
    const textPaddingRight = 2 + totalIndicatorSpace;
    const availableTextWidth = Math.max(
      0,
      w - textPaddingLeft - textPaddingRight
    );

    const displayLabel = getDynamicNodeDisplayLabel(
      {
        data: node,
        width: availableTextWidth, // Use adjusted width for truncation calculation
        height: h,
      },
      {
        ...settings,
        // Override avgCharPixelWidth with the actual calculated character width
        avgCharPixelWidth: actualCharWidth,
      }
    );

    // Remove the duplicate truncation logic - getDynamicNodeDisplayLabel handles all truncation
    const truncatedLabel = displayLabel || "";

    return (
      <>
        <rect
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
        {settings.enableLabel && truncatedLabel && w >= 20 && h >= 8 && (
          <text
            x={4}
            y={textY}
            fontSize={fontSize}
            fill={getContrastingTextColor(color)}
            pointerEvents="none"
            style={{ userSelect: "none" }}
          >
            {truncatedLabel}
          </text>
        )}
        {/* Unrendered children indicator - positioned first (rightmost) */}
        {unrenderedInfo.hasUnrendered && w >= 24 && h >= 16 && (
          <g>
            {/* Background circle for the unrendered indicator */}
            <circle
              cx={w - indicatorSize / 2 - 2}
              cy={h / 2}
              r={indicatorSize / 2}
              fill="rgba(255, 0, 0, 0.9)"
              stroke="rgba(0, 0, 0, 0.8)"
              strokeWidth={1}
            />
            {/* Exclamation mark to indicate missing content */}
            <text
              x={w - indicatorSize / 2 - 2}
              y={h / 2}
              fontSize={Math.min(indicatorSize * 0.7, 10)}
              fill="#FFF"
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              style={{ userSelect: "none", fontWeight: "bold" }}
            >
              !
            </text>
            {/* Count of unrendered children */}
            {w >= 40 && h >= 20 && (
              <text
                x={w - indicatorSize / 2 - 2}
                y={h / 2 + indicatorSize / 2 + 2}
                fontSize={Math.min(6, indicatorSize * 0.4)}
                fill={getContrastingTextColor(color)}
                textAnchor="middle"
                dominantBaseline="hanging"
                pointerEvents="none"
                style={{ userSelect: "none" }}
              >
                -{unrenderedInfo.unrenderedCount}
              </text>
            )}
          </g>
        )}
        {/* Hidden children indicator - positioned second if both exist */}
        {hasHiddenChildren && w >= 24 && h >= 16 && (
          <g>
            {/* Position to the left of unrendered indicator if both exist */}
            <circle
              cx={
                w -
                indicatorSize / 2 -
                2 -
                (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0)
              }
              cy={h / 2}
              r={indicatorSize / 2}
              fill="rgba(255, 165, 0, 0.8)"
              stroke="rgba(0, 0, 0, 0.6)"
              strokeWidth={0.5}
            />
            {/* Three dots to indicate hidden content */}
            <text
              x={
                w -
                indicatorSize / 2 -
                2 -
                (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0)
              }
              y={h / 2}
              fontSize={Math.min(indicatorSize * 0.6, 8)}
              fill="#000"
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              style={{ userSelect: "none", fontWeight: "bold" }}
            >
              ⋯
            </text>
            {/* Tooltip-like text for count when there's space */}
            {w >= 60 &&
              h >= 20 && ( // Increased width requirement since we need more space
                <text
                  x={
                    w -
                    indicatorSize / 2 -
                    2 -
                    (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0)
                  }
                  y={h / 2 + indicatorSize / 2 + 2}
                  fontSize={Math.min(6, indicatorSize * 0.4)}
                  fill={getContrastingTextColor(color)}
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
      </>
    );
  };

const createStyledRenderNode =
  (
    settings: TreemapSettings,
    matchingNodes: Set<string>,
    selectedNodeId: string | undefined,
    onNodeClick: (node: ScopeNode, event: React.MouseEvent) => void,
    onMouseEnter: (node: ScopeNode, event: React.MouseEvent) => void,
    onMouseLeave: () => void,
    minFontSize: number,
    maxFontSize: number,
    layoutRoot: AnyLayoutNode
  ): Required<TreemapSVGProps>["renderNode"] =>
  ({ node, w, h, depth }) => {
    const category = node.category;
    const color = pastelSet[category] || pastelSet[NodeCategory.Other];

    // Check if this node is selected or matches search
    const isSelected = selectedNodeId === node.id;
    const isSearchMatch = matchingNodes.has(node.id);

    // Find the corresponding layout node to check for unrendered children
    const findLayoutNode = (
      ln: AnyLayoutNode,
      nodeId: string
    ): AnyLayoutNode | null => {
      if (ln.node.id === nodeId) return ln;
      if (ln.children) {
        for (const child of ln.children) {
          const found = findLayoutNode(child as AnyLayoutNode, nodeId);
          if (found) return found;
        }
      }
      return null;
    };

    const layoutNode = findLayoutNode(layoutRoot, node.id);
    const unrenderedInfo = layoutNode
      ? hasUnrenderedChildren(node, layoutNode)
      : { hasUnrendered: false, unrenderedCount: 0 };

    // Check if this node has hidden children
    const meta = (node as any).meta || {};
    const hasHiddenChildren =
      meta.hasHiddenChildren === true ||
      (node as any).hasHiddenChildren === true;
    const hiddenChildrenCount =
      meta.hiddenChildrenCount || (node as any).hiddenChildrenCount || 0;

    // Determine border styling - prioritize unrendered children indicator
    let borderColor = "#555555";
    let strokeWidth = Math.max(0.5, settings.borderWidth - depth * 0.1);

    if (unrenderedInfo.hasUnrendered) {
      borderColor = "#FF0000"; // Bright red for unrendered children
      strokeWidth = 4; // Very thick border for leaf nodes
    } else if (isSelected) {
      borderColor = "red";
      strokeWidth = Math.max(1, settings.borderWidth + 1 - depth * 0.2);
    } else if (isSearchMatch) {
      borderColor = "#FFD700";
      strokeWidth = Math.max(0.8, settings.borderWidth + 0.5 - depth * 0.1);
    }

    const opacity = Math.max(0.6, settings.nodeOpacity - depth * 0.02);

    // Calculate font size with proper constraints
    const depthAdjustedMin = Math.max(
      minFontSize,
      minFontSize + 6 - depth * 1.5
    );
    const heightBasedSize = h * 0.6; // Size based on available height
    const fontSize = Math.min(
      maxFontSize,
      Math.max(depthAdjustedMin, heightBasedSize)
    );

    // Use the calculated fontSize for character width to ensure consistency
    const actualCharWidth = fontSize * 0.5;

    // Calculate space needed for indicators
    const indicatorSize = Math.min(10, h * 0.3, fontSize * 0.7);
    const totalIndicatorMargin =
      (hasHiddenChildren ? indicatorSize + 2 : 0) +
      (unrenderedInfo.hasUnrendered ? indicatorSize + 2 : 0);

    // Reduce margins when centering text - allow more text space
    const textMargin = 4;
    const availableTextWidth = Math.max(
      0,
      w - 2 * textMargin - totalIndicatorMargin
    );

    const displayLabel = getDynamicNodeDisplayLabel(
      {
        data: node,
        width: availableTextWidth, // Use adjusted width for truncation calculation
        height: h,
      },
      {
        ...settings,
        // Override avgCharPixelWidth with the actual calculated character width
        avgCharPixelWidth: actualCharWidth,
      }
    );

    // Only show labels if there's enough space and it meets minimum requirements
    const shouldShowLabel =
      settings.enableLabel &&
      displayLabel &&
      h >= Math.max(settings.minLabelHeight, fontSize + 4) &&
      w >= fontSize * 2;

    return (
      <>
        <rect
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
            fill={getContrastingTextColor(color)}
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ userSelect: "none" }}
          >
            {displayLabel}
          </text>
        )}
        {/* Unrendered children indicator - positioned first (top-right) */}
        {unrenderedInfo.hasUnrendered && w >= 20 && h >= 16 && (
          <g>
            <circle
              cx={w - indicatorSize / 2 - 2}
              cy={indicatorSize / 2 + 2}
              r={indicatorSize / 2}
              fill="rgba(255, 0, 0, 0.95)"
              stroke="rgba(0, 0, 0, 0.8)"
              strokeWidth={0.5}
            />
            {/* Exclamation mark to indicate missing content */}
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
            {/* Count of unrendered children */}
            {w >= 30 && h >= 24 && (
              <text
                x={w - indicatorSize / 2 - 2}
                y={indicatorSize + 4}
                fontSize={Math.min(5, indicatorSize * 0.3)}
                fill={getContrastingTextColor(color)}
                textAnchor="middle"
                dominantBaseline="hanging"
                pointerEvents="none"
                style={{ userSelect: "none" }}
              >
                -{unrenderedInfo.unrenderedCount}
              </text>
            )}
          </g>
        )}
        {/* Hidden children indicator - positioned below unrendered indicator if both exist */}
        {hasHiddenChildren && w >= 20 && h >= 16 && (
          <g>
            {/* Position below unrendered indicator if both exist */}
            <circle
              cx={w - indicatorSize / 2 - 2}
              cy={
                indicatorSize / 2 +
                2 +
                (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0)
              }
              r={indicatorSize / 2}
              fill="rgba(255, 165, 0, 0.9)"
              stroke="rgba(0, 0, 0, 0.7)"
              strokeWidth={0.3}
            />
            {/* Three dots to indicate hidden content */}
            <text
              x={w - indicatorSize / 2 - 2}
              y={
                indicatorSize / 2 +
                2 +
                (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0)
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
            {/* Small count indicator if there's space */}
            {w >= 30 &&
              h >= 40 && ( // Increased height requirement since we have two indicators
                <text
                  x={w - indicatorSize / 2 - 2}
                  y={
                    indicatorSize +
                    4 +
                    (unrenderedInfo.hasUnrendered ? indicatorSize + 4 : 0)
                  }
                  fontSize={Math.min(5, indicatorSize * 0.3)}
                  fill={getContrastingTextColor(color)}
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
      </>
    );
  };

/* ---------- component ------------ */

export const TreemapSVG: React.FC<TreemapSVGProps> = ({
  root,
  width,
  height,
  layout = binaryLayout,
  renderNode,
  renderHeader,
  padding = 4,
  minFontSize = 12,
  maxFontSize = 16,
  settings,
  matchingNodes = new Set(),
  selectedNodeId,
  onNodeClick = () => {},
  onMouseEnter = () => {},
  onMouseLeave = () => {},
}) => {
  // Determine which layout options to use based on the layout function
  const layoutOptions = useMemo(() => {
    // Check if the provided layout function is geminiLayout or binaryLayout
    // This is a bit of a hack; a more robust way might be to pass a layout 'type' string
    if (layout === (geminiLayout as AnyLayoutFn)) {
      return {
        // Options for geminiLayout
        minTextWidth: settings.minGeminiTextWidth, // Example: use settings for Gemini
        minTextHeight: settings.minGeminiTextHeight,
        minBoxSize: settings.minGeminiBoxSize,
        padding: settings.geminiPadding,
        headerHeight: settings.geminiHeaderHeight,
      };
    } else if (layout === (binaryLayout as AnyLayoutFn)) {
      return {
        minTextWidth: 40,
        minTextHeight: 20,
        minBoxSize: 12,
        padding: padding, // Use the component prop padding for binary
        headerHeight: 28,
        fontSize: 11, // binaryLayout uses this
      } as BinaryLayoutOptions; // Cast to common or binary options
    } else if (layout === (layoutHierarchical as AnyLayoutFn)) {
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
    } else {
      // Default to options for binaryLayout
      console.log(
        "[TreemapSVG] Constructing BinaryLayoutOptions (default/fallback). settings.innerPadding:",
        settings.innerPadding
      );
      return {
        minTextWidth: settings.minGeminiTextWidth, // Fallback, consider specific binary settings
        minTextHeight: settings.minGeminiTextHeight, // Fallback
        minBoxSize: settings.minGeminiBoxSize, // Fallback
        padding: settings.innerPadding, // Example, d3-hierarchy based
        headerHeight: settings.geminiHeaderHeight, // Fallback
        // sizeAccessor: (n: ScopeNode) => n.value,
      } as BinaryLayoutOptions; // Cast to common or binary options
    }
  }, [layout, settings, padding]);

  const layoutRoot = useMemo(() => {
    return layout(root, width, height, layoutOptions as any); // Cast to any to satisfy differing option types
  }, [root, width, height, layout, layoutOptions]);

  // Create the styled render functions if custom ones aren't provided
  const finalRenderHeader = useMemo(() => {
    if (renderHeader) return renderHeader;

    return createStyledRenderHeader(
      settings,
      matchingNodes,
      selectedNodeId,
      onNodeClick,
      onMouseEnter,
      onMouseLeave,
      minFontSize,
      maxFontSize,
      layoutRoot as AnyLayoutNode
    );
  }, [
    renderHeader,
    settings,
    matchingNodes,
    selectedNodeId,
    onNodeClick,
    onMouseEnter,
    onMouseLeave,
    minFontSize,
    maxFontSize,
    layoutRoot,
  ]);

  const finalRenderNode = useMemo(() => {
    if (renderNode) return renderNode;

    return createStyledRenderNode(
      settings,
      matchingNodes,
      selectedNodeId,
      onNodeClick,
      onMouseEnter,
      onMouseLeave,
      minFontSize,
      maxFontSize,
      layoutRoot as AnyLayoutNode
    );
  }, [
    renderNode,
    settings,
    matchingNodes,
    selectedNodeId,
    onNodeClick,
    onMouseEnter,
    onMouseLeave,
    minFontSize,
    maxFontSize,
    layoutRoot,
  ]);

  // Calculate header height based on depth - prioritize headers!
  const getHeaderHeight = (depth: number, availableHeight: number): number => {
    // This function might need to be dynamic based on layout type too
    // For now, using a generic approach or the one from binaryLayout.
    let maxHeaderHeight = 28; // Default for binary layout

    if (layout === (geminiLayout as AnyLayoutFn)) {
      maxHeaderHeight = settings.geminiHeaderHeight;
    } else if (layout === (layoutHierarchical as AnyLayoutFn)) {
      maxHeaderHeight = settings.hierarchicalHeaderHeight;
    }

    const minHeaderHeight = Math.max(8, minFontSize + 4); // Reduced for smaller headers

    const depthFactor = Math.max(0.85, 1 - depth * 0.03);
    const baseHeight = Math.max(minHeaderHeight, maxHeaderHeight * depthFactor);

    const maxAllowedHeight = Math.max(
      baseHeight,
      Math.min(availableHeight * 0.4, baseHeight * 1.3)
    );

    return maxAllowedHeight;
  };

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

  /* render free rectangles for debugging */
  const renderFreeRectangles = (
    freeRects: Array<{
      x: number;
      y: number;
      w: number;
      h: number;
      containerPath: string;
    }>
  ): React.ReactNode => {
    return freeRects.map((rect, index) => (
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
            style={{ userSelect: "none", fontFamily: "monospace" }}
          >
            FREE
          </text>
        )}
      </g>
    ));
  };

  /* recursive renderer with infinite depth support */
  const renderGroup = (ln: AnyLayoutNode, depth = 0): React.ReactNode => {
    // Skip rendering if the node is too small to be meaningful or marked as 'none'
    if (ln.w < 2 || ln.h < 2 || ln.renderMode === "none") {
      return null;
    }

    // Determine if this node has children that will be rendered
    const hasRenderableChildren = ln.children && ln.children.length > 0;

    // Check if this group/node is selected or matches search
    const isSelected = selectedNodeId === ln.node.id;
    const isSearchMatch = matchingNodes.has(ln.node.id);

    // Common properties for GeminiLayoutNode and BinaryLayoutNode being checked
    const isConstrainedByDepth =
      (ln as BinaryLayoutNode).isConstrainedByDepth ||
      (ln as GeminiLayoutNode).node?.meta?.isConstrainedByDepth;

    // For nodes with render mode 'box', render simplified representation
    if (ln.renderMode === "box") {
      const baseColor =
        pastelSet[ln.node.category] || pastelSet[NodeCategory.Other];
      let borderColor = "#6c757d";
      let strokeWidth = 1;

      // Special styling for container boxes - make them stand out
      const isContainerBox = (ln as HierarchicalLayoutNode).isContainer;

      if (isContainerBox) {
        // Double-thick border for container boxes
        strokeWidth = 3;
        borderColor = "#2c3e50"; // Darker, more prominent color
      }

      if (isSelected) {
        borderColor = "red";
        strokeWidth = isContainerBox ? 4 : 2; // Even thicker when selected
      } else if (isSearchMatch) {
        borderColor = "#FFD700";
        strokeWidth = isContainerBox ? 3.5 : 1.5;
      }

      return (
        <g key={ln.node.id}>
          <rect
            x={ln.x}
            y={ln.y}
            width={ln.w}
            height={ln.h}
            fill={baseColor}
            stroke={borderColor}
            strokeWidth={strokeWidth}
            opacity={isContainerBox ? 0.8 : 0.7} // Slightly more opaque for containers
            rx={2}
            style={{ cursor: "pointer" }}
            onClick={(e) => onNodeClick(ln.node, e as any)}
            onMouseEnter={(e) => onMouseEnter(ln.node, e as any)}
            onMouseLeave={onMouseLeave}
          />

          {/* Add a visual indicator for collapsed containers */}
          {isContainerBox && ln.w >= 16 && ln.h >= 16 && (
            <g>
              {/* Small collapsed indicator in the center */}
              <circle
                cx={ln.x + ln.w / 2}
                cy={ln.y + ln.h / 2}
                r={Math.min(ln.w, ln.h) * 0.15}
                fill="rgba(44, 62, 80, 0.8)"
                stroke="white"
                strokeWidth={1}
              />
              <text
                x={ln.x + ln.w / 2}
                y={ln.y + ln.h / 2}
                fontSize={Math.min(ln.w, ln.h) * 0.2}
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

          {/* Show depth constraint indicator - specific to BinaryLayoutNode for now */}
          {isConstrainedByDepth && ln.w >= 16 && ln.h >= 16 && (
            <g>
              <circle
                cx={ln.x + ln.w - 8}
                cy={ln.y + 8}
                r={4}
                fill="rgba(255, 140, 0, 0.9)"
                stroke="rgba(0, 0, 0, 0.7)"
                strokeWidth={0.5}
              />
              <text
                x={ln.x + ln.w - 8}
                y={ln.y + 8}
                fontSize="6"
                fill="#000"
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
                style={{ userSelect: "none", fontWeight: "bold" }}
              >
                ⊡
              </text>
            </g>
          )}
        </g>
      );
    }

    // For 'text' render mode (containers or leaf nodes with text)
    // HEADERS ARE PRIORITY for containers!
    // Gemini layout uses `isContainer` property. Binary layout implies container if children exist.
    const isActuallyContainer =
      (ln as GeminiLayoutNode).isContainer !== undefined
        ? (ln as GeminiLayoutNode).isContainer
        : hasRenderableChildren;

    const shouldRenderHeader = isActuallyContainer && ln.h >= 16 && ln.w >= 24;

    const headerHeightToUse = shouldRenderHeader
      ? getHeaderHeight(depth, ln.h)
      : 0;

    const shouldRenderBody = ln.h - headerHeightToUse > 8;

    // Determine group border styling
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
      // Adjusted from depth === 0 for binary, might need tweaking for Gemini
      groupBorderColor = "#6c757d";
    } else {
      groupBorderColor = "#adb5bd";
    }

    const baseColor =
      pastelSet[ln.node.category] || pastelSet[NodeCategory.Other];
    // Lighten background for containers, use direct color for leafs if Gemini says it's not a container
    const groupFillColor = isActuallyContainer
      ? lightenColor(baseColor, 30)
      : baseColor;

    return (
      <g key={ln.node.id}>
        {/* Render container background/border only if it's a container */}
        {isActuallyContainer && (
          <rect
            x={ln.x}
            y={ln.y}
            width={ln.w}
            height={ln.h}
            fill={groupFillColor}
            stroke={groupBorderColor}
            strokeWidth={groupStrokeWidth}
            opacity={groupOpacity}
            rx={Math.max(2, 4 - depth * 0.5)}
            style={{ cursor: "pointer" }}
            onClick={(e) => onNodeClick(ln.node, e as any)}
            onMouseEnter={(e) => onMouseEnter(ln.node, e as any)}
            onMouseLeave={onMouseLeave}
          />
        )}

        {/* Render header only if this node is a container and should render a header */}
        {shouldRenderHeader && (
          <g transform={`translate(${ln.x} ${ln.y})`}>
            {finalRenderHeader({
              node: ln.node,
              w: ln.w,
              h: headerHeightToUse, // Use calculated header height
              depth,
            })}
          </g>
        )}

        {/* For leaf nodes (or containers that don't render as distinct groups but show content):
            Render the node content in the available space.
            If it's a container, content is rendered below its header.
            If it's a leaf (isActuallyContainer is false), it takes the full ln.h.
            MODIFIED: Only call finalRenderNode if !isActuallyContainer (i.e., it's a leaf)
        */}
        {shouldRenderBody &&
          !isActuallyContainer && ( // Leaf nodes only
            <g
              transform={`translate(${ln.x} ${ln.y + (isActuallyContainer ? headerHeightToUse : 0)})`} // This will be ln.y for leaves as headerHeightToUse is 0
            >
              {finalRenderNode({
                node: ln.node,
                w: ln.w,
                h: ln.h - (isActuallyContainer ? headerHeightToUse : 0), // This will be ln.h for leaves
                depth,
              })}
            </g>
          )}

        {/* For parent nodes: render children directly (they already have correct absolute coordinates) */}
        {/* Ensure children exist and are of the correct type before mapping */}
        {hasRenderableChildren && ln.children && (
          <>
            {ln.children.map((child) =>
              renderGroup(child as AnyLayoutNode, depth + 1)
            )}
          </>
        )}
      </g>
    );
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {renderGroup(layoutRoot as AnyLayoutNode)}
      {settings.showDebugFreeRectangles &&
        renderFreeRectangles(
          collectAllFreeRectangles(layoutRoot as AnyLayoutNode)
        )}
    </svg>
  );
};
