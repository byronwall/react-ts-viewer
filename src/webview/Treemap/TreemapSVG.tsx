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

const defaultRenderHeader: Required<TreemapSVGProps>["renderHeader"] = ({
  node,
  w,
  h,
  depth,
}) => {
  // With the new text-first layout, we can be more generous with font sizes
  const minFontSize = Math.max(10, 16 - depth * 2); // Higher minimum, less depth reduction
  const maxFontSize = Math.min(16, h * 0.6); // Allow larger fonts in tall headers
  const fontSize = Math.max(minFontSize, maxFontSize);

  const textY = Math.min(h - 4, fontSize + 6); // Better vertical positioning with more padding

  // Calculate how many characters can fit with better spacing
  const charWidth = fontSize * 0.52; // Slightly tighter character spacing estimate
  const availableTextWidth = w - 12; // Account for padding
  const maxChars = Math.max(5, Math.floor(availableTextWidth / charWidth));

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
        x={6}
        y={textY}
        fontSize={fontSize}
        fill="#000"
        pointerEvents="none"
        style={{
          userSelect: "none",
          fontWeight: depth === 0 ? "bold" : "normal",
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
  renderHeader = defaultRenderHeader,
}) => {
  const layoutRoot = useMemo(
    () => layout(root, width, height),
    [root, width, height, layout]
  );

  // Calculate header height based on depth - prioritize headers!
  const getHeaderHeight = (depth: number, availableHeight: number): number => {
    const maxHeaderHeight = 24;
    const minHeaderHeight = 12;

    // Same logic as in binaryLayout.ts
    const depthFactor = Math.max(0.8, 1 - depth * 0.05);
    const baseHeight = Math.max(minHeaderHeight, maxHeaderHeight * depthFactor);

    const maxAllowedHeight = Math.max(
      baseHeight,
      Math.min(availableHeight * 0.45, baseHeight * 1.5)
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
        {/* Render header only if this node has children */}
        {shouldRenderHeader && (
          <g transform={`translate(${ln.x} ${ln.y})`}>
            {renderHeader({
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
