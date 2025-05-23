import { ScopeNode } from "../../types";

export function collapseBlockNode(
  node: ScopeNode,
  children: ScopeNode[]
): ScopeNode {
  // Removed options from signature
  return {
    ...node,
    children,
    meta: {
      ...(node.meta || {}),
      collapsed: "block",
      originalCategory: node.category,
    },
  };
}
