import React, { useCallback, useMemo, useRef, useState } from "react";
import type { ScopeNode } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { AnyLayoutFn, TreemapContent } from "./TreemapSVG";
import { ELKGraph } from "./ref_graph/layoutELKWithRoot";

interface ViewportState {
  scale: number;
  translateX: number;
  translateY: number;
}

// View mode types
type ViewMode = "treemap" | "referenceGraph";

// Simple declaration→reference arrow edge
export interface ReferenceEdge {
  srcId: string;
  dstId: string;
}

interface ViewportTreemapSVGProps {
  root: ScopeNode;
  width: number;
  height: number;
  layout?: AnyLayoutFn;
  padding?: number;
  minFontSize?: number;
  maxFontSize?: number;
  settings: TreemapSettings;
  matchingNodes?: Set<string>;
  selectedNodeId?: string;
  onNodeClick?: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseEnter?: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseLeave?: () => void;
  onResetViewport?: React.MutableRefObject<(() => void) | undefined>; // Ref to expose reset function
  // New props for reference graph mode
  viewMode?: ViewMode;
  elkGraph?: ELKGraph | null;
  originalFocusNodeId?: string;
  /** Edges (declaration ➜ reference) to visualise with arrows */
  edges?: ReferenceEdge[];
}

export const ViewportTreemapSVG: React.FC<ViewportTreemapSVGProps> = ({
  root,
  width,
  height,
  layout,
  padding,
  minFontSize,
  maxFontSize,
  settings,
  matchingNodes,
  selectedNodeId,
  onNodeClick,
  onMouseEnter,
  onMouseLeave,
  onResetViewport,
  viewMode = "treemap",
  elkGraph = null,
  originalFocusNodeId,
  edges = [],
}) => {
  // Viewport state
  const [viewport, setViewport] = useState<ViewportState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  // Interaction state
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Constants for zoom behavior
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;
  const ZOOM_FACTOR = 0.02; // Reduced from 0.1 to make zoom 5x less responsive

  // Get mouse position relative to SVG
  const getSVGMousePosition = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return { x: 0, y: 0 };

      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    []
  );

  // Handle zoom with mouse wheel
  const handleWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();

      const mousePos = getSVGMousePosition(event);
      const delta = -event.deltaY;
      const zoomIntensity = delta > 0 ? 1 + ZOOM_FACTOR : 1 - ZOOM_FACTOR;

      setViewport((prev) => {
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, prev.scale * zoomIntensity)
        );

        // Calculate zoom center in world coordinates
        const worldX = (mousePos.x - prev.translateX) / prev.scale;
        const worldY = (mousePos.y - prev.translateY) / prev.scale;

        // Calculate new translation to keep zoom centered on mouse
        const newTranslateX = mousePos.x - worldX * newScale;
        const newTranslateY = mousePos.y - worldY * newScale;

        return {
          scale: newScale,
          translateX: newTranslateX,
          translateY: newTranslateY,
        };
      });
    },
    [getSVGMousePosition]
  );

  // Handle pan start
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      // Only start panning on left mouse button
      if (event.button !== 0) return;

      event.preventDefault();
      setIsPanning(true);
      const mousePos = getSVGMousePosition(event);
      setLastPanPoint(mousePos);
    },
    [getSVGMousePosition]
  );

  // Handle pan move
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!isPanning) return;

      event.preventDefault();
      const mousePos = getSVGMousePosition(event);
      const deltaX = mousePos.x - lastPanPoint.x;
      const deltaY = mousePos.y - lastPanPoint.y;

      setViewport((prev) => ({
        ...prev,
        translateX: prev.translateX + deltaX,
        translateY: prev.translateY + deltaY,
      }));

      setLastPanPoint(mousePos);
    },
    [isPanning, lastPanPoint, getSVGMousePosition]
  );

  // Handle pan end
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle mouse leave to stop panning
  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    onMouseLeave?.();
  }, [onMouseLeave]);

  // Reset viewport to default
  const resetViewport = useCallback(() => {
    setViewport({
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
  }, []);

  // Expose reset function to parent via ref
  React.useEffect(() => {
    if (onResetViewport) {
      onResetViewport.current = resetViewport;
    }
  }, [onResetViewport, resetViewport]);

  // Memoize the transform string to avoid unnecessary re-calculations
  const transform = useMemo(
    () =>
      `translate(${viewport.translateX}, ${viewport.translateY}) scale(${viewport.scale})`,
    [viewport.translateX, viewport.translateY, viewport.scale]
  );

  // Map of nodeId -> rect (pre-viewport coordinates)
  const nodeRectsRef = React.useRef(
    new Map<string, { x: number; y: number; w: number; h: number }>()
  );

  // Callback receiving rectangles from TreemapContent
  const handleNodeLayout = React.useCallback(
    (id: string, rect: { x: number; y: number; w: number; h: number }) => {
      nodeRectsRef.current.set(id, rect);
    },
    []
  );

  // Memoize TreemapContent props to prevent unnecessary re-renders
  const treemapProps = useMemo(
    () => ({
      root,
      width,
      height,
      layout,
      padding,
      minFontSize,
      maxFontSize,
      settings,
      matchingNodes,
      selectedNodeId,
      onNodeClick,
      onMouseEnter,
      onMouseLeave: () => {}, // Handle mouse leave at viewport level
      viewMode,
      elkGraph,
      originalFocusNodeId,
      onNodeLayout: handleNodeLayout,
    }),
    [
      root,
      width,
      height,
      layout,
      padding,
      minFontSize,
      maxFontSize,
      settings,
      matchingNodes,
      selectedNodeId,
      onNodeClick,
      onMouseEnter,
      viewMode,
      elkGraph,
      originalFocusNodeId,
      handleNodeLayout,
    ]
  );

  // Memoized TreemapContent to prevent re-renders when only viewport changes
  const memoizedTreemapContent = useMemo(
    () => <TreemapContent {...treemapProps} />,
    [treemapProps]
  );

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Viewport info for debugging */}
      {settings.showDebugFreeRectangles && (
        <div
          style={{
            position: "absolute",
            top: 50,
            right: 10,
            zIndex: 1000,
            padding: "8px",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            borderRadius: "4px",
            fontSize: "10px",
            fontFamily: "monospace",
            whiteSpace: "pre",
          }}
        >
          {`Scale: ${viewport.scale.toFixed(2)}
Pan: ${viewport.translateX.toFixed(0)}, ${viewport.translateY.toFixed(0)}
Mode: ${isPanning ? "PANNING" : "IDLE"}`}
        </div>
      )}

      {/* Main SVG with viewport controls */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          cursor: isPanning ? "grabbing" : "grab",
          userSelect: "none",
          display: "block",
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Apply viewport transform to the entire treemap */}
        <g transform={transform}>
          {/* Render the treemap content directly */}
          {memoizedTreemapContent}

          {/* Draw arrows */}
          {edges.map((edge) => {
            const src = nodeRectsRef.current.get(edge.srcId);
            const dst = nodeRectsRef.current.get(edge.dstId);
            if (!src || !dst) return null;

            // Start at top-center of declaration rectangle
            const x1 = src.x + src.w / 2;
            const y1 = src.y;

            // End at top-center of BOI rectangle (focus node)
            const x2 = dst.x + dst.w / 2;
            const y2 = dst.y;

            return (
              <g key={`${edge.srcId}->${edge.dstId}`} pointerEvents="none">
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  fill="white"
                  stroke="#ff9800"
                  strokeWidth={2.5}
                  markerEnd="url(#arrowhead-orange)"
                />
              </g>
            );
          })}

          {/* Highlight BOI (focus) */}
          {originalFocusNodeId &&
            (() => {
              const rect = nodeRectsRef.current.get(originalFocusNodeId);
              if (!rect) return null;
              return (
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.w}
                  height={rect.h}
                  fill="none"
                  stroke="#ff9800"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  pointerEvents="none"
                />
              );
            })()}

          {/* Highlight declaration/source nodes */}
          {(() => {
            const uniqueSrcIds = new Set(edges.map((e) => e.srcId));
            return Array.from(uniqueSrcIds).map((id) => {
              // Skip if the source is also the focus node – already highlighted
              if (id === originalFocusNodeId) return null;
              const rect = nodeRectsRef.current.get(id);
              if (!rect) return null;
              return (
                <rect
                  key={`src-highlight-${id}`}
                  x={rect.x}
                  y={rect.y}
                  width={rect.w}
                  height={rect.h}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              );
            });
          })()}

          {/* Arrowhead marker definition (once) */}
          {edges.length > 0 && (
            <defs>
              <marker
                id="arrowhead-orange"
                viewBox="0 0 6 6"
                refX="5"
                refY="3"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#ff9800" />
              </marker>
            </defs>
          )}
        </g>
      </svg>
    </div>
  );
};
