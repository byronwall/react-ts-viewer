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
  maxHeaderHeight?: number;
  minHeaderHeight?: number;
  headerHeightByDepth?: (depth: number) => number;
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
  // Improved font sizing - larger base size, less aggressive depth reduction
  const fontSize = Math.max(8, Math.min(14, h * 0.6, 16 - depth * 1.2)); // Better scaling based on height
  const textY = Math.min(h - 2, fontSize + 3); // Better vertical positioning

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
        x={4}
        y={textY}
        fontSize={fontSize}
        fill="#000"
        pointerEvents="none"
        style={{ userSelect: "none" }}
      >
        {node.label.slice(
          0,
          Math.max(5, Math.floor((w - 8) / (fontSize * 0.6)))
        )}{" "}
        {/* Better text truncation based on actual width */}
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
  maxHeaderHeight = 24,
  minHeaderHeight = 12,
  headerHeightByDepth,
}) => {
  const layoutRoot = useMemo(
    () => layout(root, width, height),
    [root, width, height, layout]
  );

  // Calculate header height based on depth
  const getHeaderHeight = (depth: number, availableHeight: number): number => {
    if (headerHeightByDepth) {
      return headerHeightByDepth(depth);
    }

    // Improved logic: less aggressive reduction with depth, better minimum sizes
    const baseHeight = Math.max(minHeaderHeight, maxHeaderHeight - depth * 1.5);

    // Allow header to take up more space, but with better limits
    const maxAllowedHeight = Math.max(
      minHeaderHeight,
      Math.min(availableHeight * 0.4, 30)
    );

    return Math.min(baseHeight, maxAllowedHeight);
  };

  /* recursive renderer with infinite depth support */
  const renderGroup = (
    ln: LayoutNode,
    depth = 0,
    parentX = 0,
    parentY = 0
  ): React.ReactNode => {
    // Skip rendering if the node is too small to be meaningful
    if (ln.w < 2 || ln.h < 2) {
      return null;
    }

    // Calculate relative position from parent
    const relativeX = ln.x - parentX;
    const relativeY = ln.y - parentY;

    // Determine if this node has children that will be rendered
    const hasRenderableChildren = ln.children && ln.children.length > 0;

    // Only render headers for nodes with children
    const shouldRenderHeader =
      hasRenderableChildren && ln.h >= minHeaderHeight && ln.w >= 20;

    const headerHeight = shouldRenderHeader ? getHeaderHeight(depth, ln.h) : 0;
    const bodyY = headerHeight;
    const bodyH = Math.max(0, ln.h - headerHeight);

    // Only render body if there's meaningful space after header (or full space for leaf nodes)
    const shouldRenderBody = bodyH > 4;

    return (
      <g key={ln.node.id} transform={`translate(${relativeX} ${relativeY})`}>
        {/* Render header only if this node has children */}
        {shouldRenderHeader &&
          renderHeader({
            node: ln.node,
            w: ln.w,
            h: headerHeight,
            depth,
          })}

        {/* For leaf nodes: render the node content in the full space */}
        {shouldRenderBody && !hasRenderableChildren && (
          <g transform={`translate(0 ${bodyY})`}>
            {renderNode({
              node: ln.node,
              w: ln.w,
              h: bodyH,
              depth,
            })}
          </g>
        )}

        {/* For parent nodes: render children in the body area */}
        {shouldRenderBody && hasRenderableChildren && (
          <g transform={`translate(0 ${bodyY})`}>
            {ln.children?.map((child) =>
              renderGroup(child, depth + 1, ln.x, ln.y)
            )}
          </g>
        )}

        {/* If body is too small but we have children, render them directly without body translation */}
        {!shouldRenderBody &&
          hasRenderableChildren &&
          ln.children?.map((child) =>
            renderGroup(child, depth + 1, ln.x, ln.y)
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
