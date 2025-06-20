import React from "react";
import { ContainerNodeProps } from "./TreemapSVG";

export const ContainerNode: React.FC<ContainerNodeProps> = ({
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
