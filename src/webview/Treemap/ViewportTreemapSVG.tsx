import React, { useCallback, useMemo, useRef, useState } from "react";
import type { ScopeNode } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { AnyLayoutFn, TreemapContent } from "./TreemapSVG";
import { ELKGraph } from "./layoutELK";

interface ViewportState {
  scale: number;
  translateX: number;
  translateY: number;
}

// View mode types
type ViewMode = "treemap" | "referenceGraph";

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
        </g>
      </svg>
    </div>
  );
};
