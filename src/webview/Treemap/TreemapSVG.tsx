import React, { useMemo } from "react";
import type { ScopeNode } from "../../types";
import { NodeCategory } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { binaryLayout, LayoutFn, LayoutNode } from "./binaryLayout";
import { getContrastingTextColor } from "./getContrastingTextColor";
import { getDynamicNodeDisplayLabel } from "./getDynamicNodeDisplayLabel";
import { pastelSet } from "./pastelSet";

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

    let borderColor = "#555555";
    if (isSelected) {
      borderColor = "red";
    } else if (isSearchMatch) {
      borderColor = "#FFD700";
    }

    // Adjust visual properties based on depth
    const strokeWidth = isSelected
      ? Math.max(1, 3 - depth * 0.3)
      : Math.max(0.5, 1.5 - depth * 0.1);
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

    const displayLabel = getDynamicNodeDisplayLabel(
      {
        data: node,
        width: w,
        height: h,
      },
      settings
    );

    // Truncate label based on depth and available space
    const maxLabelLength = Math.max(5, Math.floor((w - 8) / (fontSize * 0.6)));
    const truncatedLabel = displayLabel
      ? displayLabel.length > maxLabelLength
        ? displayLabel.slice(0, maxLabelLength - 3) + "..."
        : displayLabel
      : "";

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

    let borderColor = "#555555";
    if (isSelected) {
      borderColor = "red";
    } else if (isSearchMatch) {
      borderColor = "#FFD700";
    }

    // Adjust visual properties based on depth
    const strokeWidth = isSelected
      ? Math.max(1, settings.borderWidth + 1 - depth * 0.2)
      : Math.max(0.5, settings.borderWidth - depth * 0.1);
    const opacity = Math.max(0.6, settings.nodeOpacity - depth * 0.02);

    const displayLabel = getDynamicNodeDisplayLabel(
      {
        data: node,
        width: w,
        height: h,
      },
      settings
    );

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
    () =>
      layout(root, width, height, {
        optimalCharWidth: 12,
        minCharWidth: 8,
        maxCharWidth: 18,
        headerHeight: 32,
        fontSize: 11,
        minNodeSize: 20,
        sizeAccessor: (n) => n.value,
        padding: padding,
      }),
    [root, width, height, layout, padding]
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

    // HEADERS ARE PRIORITY! Only skip headers if absolutely impossible to render
    const shouldRenderHeader =
      hasRenderableChildren && ln.h >= 16 && ln.w >= 24; // Very permissive requirements

    const headerHeight = shouldRenderHeader ? getHeaderHeight(depth, ln.h) : 0;

    // For body rendering, be more flexible - it's less important than headers
    const shouldRenderBody = ln.h - headerHeight > 8; // Reduced threshold

    return (
      <g key={ln.node.id}>
        {/* Render container background for nodes with children - simplified since padding is now in layout */}
        {hasRenderableChildren && depth > 0 && (
          <rect
            x={ln.x}
            y={ln.y}
            width={ln.w}
            height={ln.h}
            fill="none"
            stroke={depth === 1 ? "#6c757d" : "#adb5bd"}
            strokeWidth={Math.max(0.5, 1.5 - depth * 0.2)}
            opacity={Math.max(0.3, 0.6 - depth * 0.1)}
            rx={Math.max(2, 4 - depth * 0.5)}
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
