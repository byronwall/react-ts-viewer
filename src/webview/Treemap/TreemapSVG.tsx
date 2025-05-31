import React, { useMemo } from "react";
import type { ScopeNode } from "../../types";
import { NodeCategory } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { binaryLayout, LayoutFn, LayoutNode } from "./binaryLayout";
import { getContrastingTextColor } from "./getContrastingTextColor";
import { getDynamicNodeDisplayLabel } from "./getDynamicNodeDisplayLabel";
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

export interface TreemapSVGProps {
  root: ScopeNode;
  width: number;
  height: number;
  layout?: LayoutFn;
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
    maxFontSize: number
  ): Required<TreemapSVGProps>["renderHeader"] =>
  ({ node, w, h, depth }) => {
    const category = node.category;
    const color = pastelSet[category] || pastelSet[NodeCategory.Other];

    // Check if this node is selected or matches search
    const isSelected = selectedNodeId === node.id;
    const isSearchMatch = matchingNodes.has(node.id);

    // Check if this node has hidden children
    const hasHiddenChildren = node.meta?.hasHiddenChildren === true;
    const hiddenChildrenCount = node.meta?.hiddenChildrenCount || 0;

    // Use subdued borders for headers since group container handles main border
    let borderColor = "#333333";
    if (isSelected) {
      borderColor = "#cc0000"; // Darker red for header within selected group
    } else if (isSearchMatch) {
      borderColor = "#ccaa00"; // Darker gold for header within matching group
    }

    // Subdued stroke width for headers - group border is the primary visual
    const strokeWidth = 0.5;
    const opacity = Math.max(0.8, 1 - depth * 0.02);

    // Calculate font size with proper constraints
    const depthAdjustedMin = Math.max(
      minFontSize,
      minFontSize + 6 - depth * 1.5
    );
    const heightBasedSize = h * 0.7; // Size based on available height
    const fontSize = Math.min(
      maxFontSize,
      Math.max(depthAdjustedMin, heightBasedSize)
    );

    const textY = Math.min(h - 2, fontSize + 2);

    console.log(
      `[RENDER HEADER] ${node.label}, depth: ${depth}, h: ${h}, calculated fontSize: ${fontSize}, minFontSize: ${minFontSize}`
    );

    // Use the calculated fontSize for character width to ensure consistency
    const actualCharWidth = fontSize * 0.5;

    // Calculate space needed for hidden children indicator
    const indicatorSize = Math.min(12, h * 0.4, fontSize * 0.8);
    const indicatorPadding = hasHiddenChildren ? indicatorSize + 4 : 0;

    // Reduce padding to allow more text space
    const textPaddingLeft = 4;
    const textPaddingRight = 2 + indicatorPadding;
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
        {/* Hidden children indicator */}
        {hasHiddenChildren && w >= 24 && h >= 16 && (
          <g>
            {/* Background circle for the indicator */}
            <circle
              cx={w - indicatorSize / 2 - 2}
              cy={h / 2}
              r={indicatorSize / 2}
              fill="rgba(255, 165, 0, 0.8)"
              stroke="rgba(0, 0, 0, 0.6)"
              strokeWidth={0.5}
            />
            {/* Three dots to indicate hidden content */}
            <text
              x={w - indicatorSize / 2 - 2}
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
    maxFontSize: number
  ): Required<TreemapSVGProps>["renderNode"] =>
  ({ node, w, h, depth }) => {
    const category = node.category;
    const color = pastelSet[category] || pastelSet[NodeCategory.Other];

    // Check if this node is selected or matches search
    const isSelected = selectedNodeId === node.id;
    const isSearchMatch = matchingNodes.has(node.id);

    // Check if this node has hidden children
    const hasHiddenChildren = node.meta?.hasHiddenChildren === true;
    const hiddenChildrenCount = node.meta?.hiddenChildrenCount || 0;

    // For leaf nodes, keep stronger borders since they don't have group containers
    let borderColor = "#555555";
    let strokeWidth = Math.max(0.5, settings.borderWidth - depth * 0.1);

    if (isSelected) {
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

    console.log(
      `[RENDER NODE] ${node.label}, depth: ${depth}, h: ${h}, calculated fontSize: ${fontSize}, minFontSize: ${minFontSize}`
    );

    // Use the calculated fontSize for character width to ensure consistency
    const actualCharWidth = fontSize * 0.5;

    // Calculate space needed for hidden children indicator
    const indicatorSize = Math.min(10, h * 0.3, fontSize * 0.7);
    const indicatorMargin = hasHiddenChildren ? indicatorSize + 2 : 0;

    // Reduce margins when centering text - allow more text space
    const textMargin = 4;
    const availableTextWidth = Math.max(
      0,
      w - 2 * textMargin - indicatorMargin
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
        {/* Hidden children indicator for leaf nodes */}
        {hasHiddenChildren && w >= 20 && h >= 16 && (
          <g>
            {/* Position indicator in top-right corner */}
            <circle
              cx={w - indicatorSize / 2 - 2}
              cy={indicatorSize / 2 + 2}
              r={indicatorSize / 2}
              fill="rgba(255, 165, 0, 0.9)"
              stroke="rgba(0, 0, 0, 0.7)"
              strokeWidth={0.3}
            />
            {/* Three dots to indicate hidden content */}
            <text
              x={w - indicatorSize / 2 - 2}
              y={indicatorSize / 2 + 2}
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
      maxFontSize
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
      maxFontSize
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
  ]);

  const layoutRoot = useMemo(
    () => layout(root, width, height),
    [root, width, height, layout, padding, minFontSize]
  );

  // Calculate header height based on depth - prioritize headers!
  const getHeaderHeight = (depth: number, availableHeight: number): number => {
    const maxHeaderHeight = 28; // Increased from 24
    const minHeaderHeight = Math.max(16, minFontSize + 8); // Base on minFontSize

    // Same logic as in binaryLayout.ts but with larger base values
    const depthFactor = Math.max(0.85, 1 - depth * 0.03); // Less aggressive scaling
    const baseHeight = Math.max(minHeaderHeight, maxHeaderHeight * depthFactor);

    const maxAllowedHeight = Math.max(
      baseHeight,
      Math.min(availableHeight * 0.4, baseHeight * 1.3)
    );

    return maxAllowedHeight;
  };

  /* recursive renderer with infinite depth support */
  const renderGroup = (ln: LayoutNode, depth = 0): React.ReactNode => {
    // Skip rendering if the node is too small to be meaningful
    if (ln.w < 2 || ln.h < 2) {
      return null;
    }

    // Determine if this node has children that will be rendered
    const hasRenderableChildren = ln.children && ln.children.length > 0;

    // Check if this group/node is selected or matches search
    const isSelected = selectedNodeId === ln.node.id;
    const isSearchMatch = matchingNodes.has(ln.node.id);

    // HEADERS ARE PRIORITY! Only skip headers if absolutely impossible to render
    const shouldRenderHeader =
      hasRenderableChildren && ln.h >= 16 && ln.w >= 24; // Very permissive requirements

    const headerHeight = shouldRenderHeader ? getHeaderHeight(depth, ln.h) : 0;

    // For body rendering, be more flexible - it's less important than headers
    const shouldRenderBody = ln.h - headerHeight > 8; // Reduced threshold

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
      groupBorderColor = "#6c757d";
    } else {
      groupBorderColor = "#adb5bd";
    }

    // Calculate the background fill color for the group
    const baseColor =
      pastelSet[ln.node.category] || pastelSet[NodeCategory.Other];
    const groupFillColor = lightenColor(baseColor, 30); // 30% lighter than the header color

    return (
      <g key={ln.node.id}>
        {/* Render container background/border for nodes with children */}
        {hasRenderableChildren && (
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

        {/* Render header only if this node has children */}
        {shouldRenderHeader && (
          <g transform={`translate(${ln.x} ${ln.y})`}>
            {finalRenderHeader({
              node: ln.node,
              w: ln.w,
              h: headerHeight,
              depth,
            })}
          </g>
        )}

        {/* For leaf nodes: render the node content in the available space */}
        {shouldRenderBody && !hasRenderableChildren && (
          <g transform={`translate(${ln.x} ${ln.y + headerHeight})`}>
            {finalRenderNode({
              node: ln.node,
              w: ln.w,
              h: ln.h - headerHeight,
              depth,
            })}
          </g>
        )}

        {/* For parent nodes: render children directly (they already have correct absolute coordinates) */}
        {hasRenderableChildren && (
          <>{ln.children?.map((child) => renderGroup(child, depth + 1))}</>
        )}
      </g>
    );
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {renderGroup(layoutRoot)}
    </svg>
  );
};
