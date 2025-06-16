import React from "react";
import type { ScopeNode } from "../../types";
import { NodeCategory } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { getContrastingTextColor } from "./getContrastingTextColor";
import { ELKGraph, ELKLayoutNode } from "./layoutELK";

import { pastelSet } from "./pastelSet";
import { lightenColor } from "./TreemapSVG";

// React component for ELK graph rendering (proof of life)
export interface ELKGraphRendererProps {
  elkGraph: ELKGraph;
  scopeNodes: Map<string, ScopeNode>; // Map from ID to ScopeNode for data lookup
  settings: TreemapSettings;
  onNodeClick: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseEnter: (node: ScopeNode, event: React.MouseEvent) => void;
  onMouseLeave: () => void;
  selectedNodeId?: string;
  originalFocusNodeId?: string;
}

export const ELKGraphRenderer: React.FC<ELKGraphRendererProps> = ({
  elkGraph,
  scopeNodes,
  settings,
  onNodeClick,
  onMouseEnter,
  onMouseLeave,
  selectedNodeId,
  originalFocusNodeId,
}) => {
  console.log("🎨 Rendering ELK graph:", {
    childrenCount: elkGraph.children.length,
    edgesCount: elkGraph.edges.length,
    originalFocusNodeId: originalFocusNodeId,
  });

  // Build a map of all ELK nodes (including nested ones) for edge rendering
  const buildElkNodeMap = (
    nodes: ELKLayoutNode[]
  ): Map<string, ELKLayoutNode> => {
    const map = new Map<string, ELKLayoutNode>();

    const addToMap = (node: ELKLayoutNode, parentX = 0, parentY = 0) => {
      // Store absolute position for this node
      const absoluteNode = {
        ...node,
        x: (node.x || 0) + parentX,
        y: (node.y || 0) + parentY,
      };
      map.set(node.id, absoluteNode);

      // Recursively add children
      if (node.children) {
        node.children.forEach((child) =>
          addToMap(child, absoluteNode.x, absoluteNode.y)
        );
      }
    };

    nodes.forEach((node) => addToMap(node));
    return map;
  };

  const elkNodeMap = buildElkNodeMap(elkGraph.children);

  const renderELKNode = (elkNode: ELKLayoutNode, depth = 0) => {
    const scopeNode = scopeNodes.get(elkNode.id);

    // Handle synthetic nodes (e.g. parameter placeholders) that do not exist in the Scope tree
    const isSynthetic = !scopeNode;
    if (isSynthetic) {
      // Very small, simple node – derive a label from the ELK node metadata
      const derivedLabel =
        (elkNode as any).labels?.[0]?.text ||
        elkNode.id.split("::param:")[1] ||
        elkNode.id;

      const baseColor = pastelSet[NodeCategory.Variable] || "#9ca3af"; // gray fallback

      return (
        <g
          key={elkNode.id}
          transform={`translate(${elkNode.x || 0}, ${elkNode.y || 0})`}
          className="elk-node synthetic-param"
        >
          <rect
            x={0}
            y={0}
            width={elkNode.width}
            height={elkNode.height}
            fill={baseColor}
            stroke="#333"
            strokeWidth={1}
            rx={3}
          />
          <text
            x={elkNode.width / 2}
            y={elkNode.height / 2}
            fontSize={Math.min(12, Math.max(8, elkNode.height * 0.4))}
            fill={getContrastingTextColor(baseColor)}
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
            style={{ userSelect: "none" }}
          >
            {derivedLabel}
          </text>
        </g>
      );
    }

    const isSelectedNode = elkNode.id === selectedNodeId;
    const isOriginalFocus = elkNode.id === originalFocusNodeId;
    const category = scopeNode.category;
    const baseColor = pastelSet[category] || pastelSet[NodeCategory.Other];

    const hasChildren = elkNode.children && elkNode.children.length > 0;
    const headerHeight = hasChildren ? Math.min(30, elkNode.height * 0.2) : 0;

    return (
      <g
        key={elkNode.id}
        transform={`translate(${elkNode.x || 0}, ${elkNode.y || 0})`}
        className="elk-node"
      >
        {/* Bold orange border for block of interest (original focus node) */}
        {isOriginalFocus && (
          <rect
            x={-4}
            y={-4}
            width={elkNode.width + 8}
            height={elkNode.height + 8}
            fill="none"
            stroke="#ff6b35" // bold orange
            strokeWidth={4}
            strokeDasharray="8,4"
            rx={8}
            opacity={1}
          />
        )}
        {/* Container background (if has children) */}
        {hasChildren && (
          <rect
            x={0}
            y={headerHeight}
            width={elkNode.width}
            height={elkNode.height - headerHeight}
            fill={lightenColor(baseColor, 30)}
            stroke="#6c757d"
            strokeWidth={1}
            rx={4}
            opacity={0.3}
            style={{ cursor: "pointer" }}
            onClick={(e) => onNodeClick(scopeNode, e as any)}
            onMouseEnter={(e) => onMouseEnter(scopeNode, e as any)}
            onMouseLeave={onMouseLeave}
          />
        )}

        {/* Main node rectangle */}
        <rect
          x={0}
          y={0}
          width={elkNode.width}
          height={hasChildren ? headerHeight : elkNode.height}
          fill={baseColor}
          stroke={isSelectedNode ? "#f59e0b" : "#333333"}
          strokeWidth={isSelectedNode ? 3 : 2}
          rx={4}
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            onNodeClick(scopeNode, e as any);
          }}
          onMouseEnter={(e) => {
            onMouseEnter(scopeNode, e as any);
          }}
          onMouseLeave={() => {
            onMouseLeave();
          }}
        />

        {/* Node label */}
        <text
          x={elkNode.width / 2}
          y={(hasChildren ? headerHeight : elkNode.height) / 2}
          fontSize={Math.min(
            12,
            Math.max(8, (hasChildren ? headerHeight : elkNode.height) * 0.4)
          )}
          fill={getContrastingTextColor(baseColor)}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {scopeNode.label || scopeNode.id.split(":").pop() || "Node"}
        </text>

        {/* Render children recursively if they exist */}
        {elkNode.children?.map((child) => {
          return renderELKNode(child, depth + 1);
        })}
      </g>
    );
  };

  const renderedNodes = elkGraph.children.map((node) => renderELKNode(node, 0));

  return (
    <>
      {/* Define arrowhead marker for edges */}
      <defs>
        <marker
          id="arrowhead-default"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#4a90e2" opacity={0.8} />
        </marker>
        <marker
          id="arrowhead-incoming"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" opacity={0.8} />
        </marker>
        <marker
          id="arrowhead-outgoing"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" opacity={0.8} />
        </marker>
        <marker
          id="arrowhead-recursive"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" opacity={0.8} />
        </marker>
      </defs>

      <g>{renderedNodes}</g>

      {/* Render edges if any exist */}
      {elkGraph.edges.map((edge) => {
        // Find source and target nodes using the node map (which includes nested nodes)
        const sourceNodeId = edge.sources[0];
        const targetNodeId = edge.targets[0];

        if (!sourceNodeId || !targetNodeId) {
          console.warn(`⚠️ Edge ${edge.id}: Missing source or target ID`, {
            sourceNodeId,
            targetNodeId,
          });
          return null;
        }

        const sourceELKNode = elkNodeMap.get(sourceNodeId);
        const targetELKNode = elkNodeMap.get(targetNodeId);

        if (!sourceELKNode || !targetELKNode) {
          console.warn(`⚠️ Edge ${edge.id}: Could not find nodes`, {
            sourceNodeId,
            targetNodeId,
            sourceFound: !!sourceELKNode,
            targetFound: !!targetELKNode,
          });
          return null;
        }

        // Helper function to calculate a more semantically-correct anchor point for an ELK node.
        // If the node is a *container* (has children), we want arrows to connect to the
        // header region rather than the geometric centre to avoid visual overlap with
        // its body contents.  Otherwise we fall back to the centre.
        const calcAnchor = (
          elkNode: ELKLayoutNode
        ): { x: number; y: number } => {
          const absX = elkNode.x || 0;
          const absY = elkNode.y || 0;

          const hasChildren = !!(
            elkNode.children && elkNode.children.length > 0
          );
          const headerHeight = hasChildren
            ? Math.min(30, elkNode.height * 0.2)
            : 0;

          const anchorX = absX + elkNode.width / 2;
          const anchorY = hasChildren
            ? absY + headerHeight / 2 // mid-point of the header bar
            : absY + elkNode.height / 2; // simple centre for leaf nodes

          return { x: anchorX, y: anchorY };
        };

        // Calculate anchor points of the nodes for edge connections (using absolute positions)
        const { x: sourceCenterX, y: sourceCenterY } =
          calcAnchor(sourceELKNode);
        const { x: targetCenterX, y: targetCenterY } =
          calcAnchor(targetELKNode);

        // Determine edge style based on direction (from edge ID)
        const isIncoming = edge.id.includes("_incoming_");
        const isRecursive = edge.id.includes("_recursive_");
        const isOutgoing =
          edge.id.includes("_outgoing_") || (!isIncoming && !isRecursive);

        // Set edge styles based on direction
        let strokeColor = "#4a90e2"; // Default blue
        let strokeDasharray = "none";
        let strokeWidth = 2;
        let markerEnd = "url(#arrowhead-default)";

        if (isIncoming) {
          strokeColor = "#22c55e"; // Green for incoming
          strokeDasharray = "none";
          strokeWidth = 2.5;
          markerEnd = "url(#arrowhead-incoming)";
        } else if (isRecursive) {
          strokeColor = "#f59e0b"; // Orange for recursive
          strokeDasharray = "8,4";
          strokeWidth = 2;
          markerEnd = "url(#arrowhead-recursive)";
        } else if (isOutgoing) {
          strokeColor = "#3b82f6"; // Blue for outgoing
          strokeDasharray = "4,2";
          strokeWidth = 2;
          markerEnd = "url(#arrowhead-outgoing)";
        }

        return (
          <g key={edge.id}>
            <line
              x1={sourceCenterX}
              y1={sourceCenterY}
              x2={targetCenterX}
              y2={targetCenterY}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              opacity={0.8}
              markerEnd={markerEnd}
            />
          </g>
        );
      })}
    </>
  );
};
