import type { ElkNode } from "elkjs";
import type { ScopeNode } from "../../../types";

// Convert hierarchical ScopeNode structure to ELK format

export function hierarchicalScopeNodeToELK(
  node: ScopeNode,
  targetNodeIds: Set<string>,
  minWidth = 120,
  minHeight = 60
): ElkNode {
  // Calculate dimensions based on whether this is a target node or container
  const isTargetNode = targetNodeIds.has(node.id);
  const labelLength = (node.label || node.id.split(":").pop() || "Node").length;

  let width: number;
  let height: number;

  if (isTargetNode && (!node.children || node.children.length === 0)) {
    // Target leaf nodes (actual referenced nodes) should be appropriately sized
    width = Math.max(minWidth, labelLength * 8 + 20);
    height = Math.max(minHeight, 60);
  } else {
    // Container nodes should be larger to accommodate children
    const childrenWidth = node.children?.length ? 200 : 120;
    const childrenHeight = node.children?.length ? 120 : 80;
    width = Math.max(childrenWidth, labelLength * 8 + 40);
    height = Math.max(childrenHeight, 80);
  }

  const elkNode: ElkNode = {
    id: node.id,
    width,
    height,
  };

  // Process children if they exist and maintain hierarchy
  if (node.children && node.children.length > 0) {
    elkNode.children = [];

    for (const child of node.children) {
      const childElkNode = hierarchicalScopeNodeToELK(
        child,
        targetNodeIds,
        minWidth,
        minHeight
      );
      elkNode.children.push(childElkNode);
    }

    // Set layout options for container nodes
    elkNode.layoutOptions = {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "20",
      "elk.padding": "[top=30,left=10,bottom=10,right=10]", // Extra top padding for container header
    };
  }

  return elkNode;
}
