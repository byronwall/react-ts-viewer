import React, { useMemo } from "react";
import type { ScopeNode } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import {
  HierarchicalLayoutFn,
  HierarchicalLayoutNode,
  HierarchicalLayoutOptions,
  layoutHierarchical,
} from "./layoutHierarchical";

import { collectAllNodes } from "./collectAllNodes";
import { ContainerNode } from "./ContainerNode";
import { LeafNode } from "./LeafNode";

// Stylesheet for treemap animations
const treemapStyles = `
  .treemap-container {
    transition: transform 500ms ease-in-out;
  }
  
  .treemap-leaf {
    transition: transform 500ms ease-in-out;
  }
`;

/* ---------- utility functions ------------ */

// Function to lighten a hex color by a percentage
export const lightenColor = (hex: string, percent: number): string => {
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

/* ---------- flat rendering system ------------ */

export interface FlatContainerNode {
  id: string;
  node: ScopeNode;
  x: number; // Absolute position
  y: number; // Absolute position
  w: number;
  h: number;
  headerHeight: number;
  depth: number;
  renderOrder: number;
  // Styling properties
  color: string;
  borderColor: string;
  strokeWidth: number;
  opacity: number;
  groupBorderColor: string;
  groupStrokeWidth: number;
  groupOpacity: number;
  groupFillColor: string;
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

// Helper function to detect unrendered children (moved from existing code)
export const hasUnrenderedChildrenHelper = (
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

// React component for container nodes
export interface ContainerNodeProps {
  container: FlatContainerNode;
  onNodeClick: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseEnter: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseLeave: () => void;
  /**
   * Optional callback fired once per render to inform parent components
   * of the container rectangle (after layout, before viewport transform).
   */
  onNodeLayout?: (
    id: string,
    rect: { x: number; y: number; w: number; h: number }
  ) => void;
}

// React component for free rectangles debug visualization
interface FreeRectanglesProps {
  freeRects: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    containerPath: string;
  }>;
}

const FreeRectangles: React.FC<FreeRectanglesProps> = ({ freeRects }) => {
  return (
    <>
      {freeRects.map((rect, index) => (
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
              style={{
                userSelect: "none",
                fontFamily: "monospace",
              }}
            >
              FREE
            </text>
          )}
        </g>
      ))}
    </>
  );
};

/* ---------- type definitions ------------ */

export type AnyLayoutNode = HierarchicalLayoutNode;

export type AnyLayoutFn = HierarchicalLayoutFn;

// View mode types
type ViewMode = "treemap" | "referenceGraph";

interface TreemapSVGProps {
  root: ScopeNode;
  width: number;
  height: number;
  layout?: AnyLayoutFn;
  padding?: number;
  minFontSize?: number;
  maxFontSize?: number;
  // Props for rendering logic
  settings: TreemapSettings;
  matchingNodes?: Set<string>;
  selectedNodeId?: string;
  onNodeClick?: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseEnter?: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseLeave?: () => void;
  // New props for reference graph mode
  viewMode?: ViewMode;
  originalFocusNodeId?: string;
  /** receives absolute (pre-viewport) rects for every rendered node */
  onNodeLayout?: (
    id: string,
    rect: { x: number; y: number; w: number; h: number }
  ) => void;
}

/* ---------- component ------------ */

// Internal component that renders just the treemap content without the outer SVG wrapper
export const TreemapContent: React.FC<TreemapSVGProps> = ({
  root,
  width,
  height,
  layout = layoutHierarchical,
  padding = 4,
  minFontSize = 12,
  maxFontSize = 16,
  settings,
  matchingNodes = new Set(),
  selectedNodeId,
  onNodeClick = () => {},
  onMouseEnter = () => {},
  onMouseLeave = () => {},
  onNodeLayout,
  viewMode = "treemap",

  originalFocusNodeId,
}) => {
  // Determine which layout options to use based on the layout function
  const layoutOptions = useMemo(() => {
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
  }, [layout, settings, padding]);

  const layoutRoot = useMemo(() => {
    return layout(root, width, height, layoutOptions as any);
  }, [root, width, height, layout, layoutOptions]);

  // Collect flat nodes for rendering
  const { containers, leaves } = useMemo(() => {
    return collectAllNodes(
      layoutRoot as AnyLayoutNode,
      settings,
      matchingNodes,
      selectedNodeId,
      minFontSize,
      maxFontSize,
      layoutOptions
    );
  }, [
    layoutRoot,
    settings,
    matchingNodes,
    selectedNodeId,
    minFontSize,
    maxFontSize,
    layoutOptions,
  ]);

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

  // Helper function to build ScopeNode map for ELK renderer
  const buildScopeNodeMap = (
    node: ScopeNode,
    map = new Map<string, ScopeNode>()
  ): Map<string, ScopeNode> => {
    map.set(node.id, node);
    if (node.children) {
      node.children.forEach((child) => buildScopeNodeMap(child, map));
    }
    return map;
  };

  // Default treemap rendering

  // Combine all nodes and sort by render order for breadth-first rendering
  const allNodes = [
    ...containers.map((c) => ({ type: "container" as const, node: c })),
    ...leaves.map((l) => ({ type: "leaf" as const, node: l })),
  ].sort((a, b) => a.node.renderOrder - b.node.renderOrder);

  return (
    <>
      {/* Stylesheet for transitions */}
      <defs>
        <style>{treemapStyles}</style>
      </defs>

      {/* Render all nodes in breadth-first order */}
      {allNodes.map(({ type, node }) =>
        type === "container" ? (
          <ContainerNode
            key={node.id}
            container={node}
            onNodeClick={onNodeClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onNodeLayout={onNodeLayout}
          />
        ) : (
          <LeafNode
            key={node.id}
            leaf={node}
            onNodeClick={onNodeClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onNodeLayout={onNodeLayout}
          />
        )
      )}

      {/* Debug elements last */}
      {settings.showDebugFreeRectangles && (
        <FreeRectangles
          freeRects={collectAllFreeRectangles(layoutRoot as AnyLayoutNode)}
        />
      )}
    </>
  );
};
