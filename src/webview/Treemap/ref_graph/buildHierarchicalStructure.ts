import type { ScopeNode } from "../../../types";
import { findCommonAncestor } from "./graph_nodes";
import { getPathToNode } from "./graph_nodes";

// Helper function to build hierarchical structure preserving parent-child relationships

export function buildHierarchicalStructure(
  nodes: ScopeNode[],
  rootNode: ScopeNode
): ScopeNode {
  const nodeIds = nodes.map((n) => n.id);
  const commonAncestor = findCommonAncestor(rootNode, nodeIds);

  // Build the path from root to the common ancestor so we can include higher-level context
  const ancestorPath = getPathToNode(rootNode, commonAncestor.id);

  // Helper to attach child into shallow copy
  const cloneNode = (n: ScopeNode): ScopeNode => ({
    ...n,
    children: n.children ? [] : [],
  });

  // Build a tree that includes all necessary nodes and their hierarchical relationships
  function buildSubtree(node: ScopeNode): ScopeNode | null {
    // Check if this node should be included
    const shouldInclude = nodeIds.includes(node.id);

    // Process children recursively
    const includedChildren: ScopeNode[] = [];
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const builtChild = buildSubtree(child);
        if (builtChild) {
          includedChildren.push(builtChild);
        }
      }
    }

    // Include this node if either:
    // 1. It's explicitly in our target nodes, OR
    // 2. It has children that need to be included (intermediate node)
    if (shouldInclude || includedChildren.length > 0) {
      const result: ScopeNode = {
        ...node,
        children: includedChildren, // Always use the array, even if empty
      };
      return result;
    }

    return null;
  }

  const hierarchicalTree = buildSubtree(commonAncestor);

  // Now graft this subtree under the ancestor chain to reach the root
  let current: ScopeNode = hierarchicalTree || commonAncestor;
  for (let i = ancestorPath.length - 2; i >= 0; i--) {
    const anc = ancestorPath[i];
    if (!anc) continue;
    const parent = cloneNode(anc);
    parent.children = [current];
    current = parent;
  }

  return current;
}
