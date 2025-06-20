import React from "react";
import type { ScopeNode } from "../../types";

export interface FlatLeafNode {
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

export const LeafNode: React.FC<LeafNodeProps> = ({
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
