import React, { useMemo } from "react";
import type { ScopeNode } from "../../types";
import { binaryLayout, LayoutNode, LayoutFn } from "./binaryLayout";

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
}

/* ---------- defaults ------------ */

const defaultRenderNode: Required<TreemapSVGProps>["renderNode"] = ({
  w,
  h,
  depth,
}) => (
  <rect
    width={w}
    height={h}
    fill="#4c91f0"
    stroke="#1d2230"
    strokeWidth={Math.max(0.5, 2 - depth * 0.2)}
    opacity={Math.max(0.3, 1 - depth * 0.1)}
  />
);

const createDefaultRenderHeader =
  (
    minFontSize: number,
    maxFontSize: number
  ): Required<TreemapSVGProps>["renderHeader"] =>
  ({ node, w, h, depth }) => {
    // Improved text sizing with configurable bounds
    const depthAdjustedMin = Math.max(
      minFontSize,
      minFontSize + 6 - depth * 1.5
    ); // Gentler depth reduction
    const heightBasedSize = h * 0.7; // Size based on available height

    // Properly clamp between min and max
    const fontSize = Math.min(
      maxFontSize,
      Math.max(depthAdjustedMin, heightBasedSize)
    );

    const textY = Math.min(h - 4, fontSize + 8); // Better vertical positioning

    // Calculate character fit with improved spacing
    const charWidth = fontSize * 0.55; // Slightly more conservative character spacing
    const availableTextWidth = w - 16; // More generous padding
    const maxChars = Math.max(3, Math.floor(availableTextWidth / charWidth));

    return (
      <>
        <rect
          width={w}
          height={h}
          fill="#8ad1c2"
          stroke="#5a9a8a"
          strokeWidth={Math.max(0.5, 1.5 - depth * 0.1)}
          opacity={Math.max(0.7, 1 - depth * 0.05)}
        />
        <text
          x={8}
          y={textY}
          fontSize={fontSize}
          fill="#000"
          pointerEvents="none"
          style={{
            userSelect: "none",
            fontWeight: depth === 0 ? "bold" : depth <= 1 ? "600" : "normal",
          }}
        >
          {node.label.slice(0, maxChars)}
        </text>
      </>
    );
  };

/* ---------- component ------------ */

export const TreemapSVG: React.FC<TreemapSVGProps> = ({
  root,
  width,
  height,
  layout = binaryLayout,
  renderNode = defaultRenderNode,
  renderHeader,
  padding = 4,
  minFontSize = 12,
  maxFontSize = 18,
}) => {
  // Create the default render header with the font size constraints
  const defaultRenderHeaderWithFontSizes = useMemo(
    () => createDefaultRenderHeader(minFontSize, maxFontSize),
    [minFontSize, maxFontSize]
  );

  const finalRenderHeader = renderHeader || defaultRenderHeaderWithFontSizes;

  const layoutRoot = useMemo(
    () => layout(root, width, height),
    [root, width, height, layout]
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

  // Helper function to calculate the bounding box of all children
  const getChildrenBounds = (ln: LayoutNode) => {
    if (!ln.children || ln.children.length === 0) {
      return { minX: ln.x, minY: ln.y, maxX: ln.x + ln.w, maxY: ln.y + ln.h };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const processNode = (node: LayoutNode) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.w);
      maxY = Math.max(maxY, node.y + node.h);

      if (node.children) {
        node.children.forEach(processNode);
      }
    };

    ln.children.forEach(processNode);

    return { minX, minY, maxX, maxY };
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

    console.log(
      `[RENDER] Node: ${ln.node.label}, depth: ${depth}, ln.h: ${ln.h}, shouldRenderHeader: ${shouldRenderHeader}, headerHeight: ${headerHeight}`
    );
    console.log(
      `[RENDER] Node positioned at ln.y: ${ln.y}, header will be at: ${ln.y}, children should be at: ${ln.y + headerHeight}`
    );

    // For body rendering, be more flexible - it's less important than headers
    const shouldRenderBody = ln.h - headerHeight > 8; // Reduced threshold

    return (
      <g key={ln.node.id}>
        {/* Render container background for nodes with children */}
        {hasRenderableChildren &&
          (() => {
            const bounds = getChildrenBounds(ln);
            const containerX = bounds.minX - padding;
            const containerY = bounds.minY - padding;
            const containerW = bounds.maxX - bounds.minX + 2 * padding;
            const containerH = bounds.maxY - bounds.minY + 2 * padding;

            return (
              <rect
                x={containerX}
                y={containerY}
                width={containerW}
                height={containerH}
                fill={depth === 0 ? "#f8f9fa" : "#ffffff"}
                stroke={depth === 0 ? "#6c757d" : "#adb5bd"}
                strokeWidth={Math.max(1, 2 - depth * 0.2)}
                opacity={Math.max(0.4, 0.8 - depth * 0.1)}
                rx={Math.max(2, 4 - depth * 0.5)}
              />
            );
          })()}

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
            {renderNode({
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
