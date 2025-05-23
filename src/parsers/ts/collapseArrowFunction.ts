import { ScopeNode, NodeCategory } from "../../types";

export function collapseArrowFunction(
  node: ScopeNode,
  children: ScopeNode[]
  // options: Required<BuildScopeTreeOptions> // Options removed from signature
): ScopeNode {
  let callNodeLabel: string | undefined = undefined;

  function findCallLabelRecursive(nodes: ScopeNode[]): string | undefined {
    for (const child of nodes) {
      if (child.category === NodeCategory.Call) {
        return child.label;
      }
      if (child.children && child.children.length > 0) {
        const found = findCallLabelRecursive(child.children);
        if (found) return found;
      }
    }
    return undefined;
  }

  callNodeLabel = findCallLabelRecursive(children);

  return {
    ...node,
    // Children are kept, but visualizer might hide them or represent the node differently.
    children,
    meta: {
      ...(node.meta || {}),
      collapsed: "arrowFunction",
      originalCategory: node.category,
      call: callNodeLabel, // Store the label of the found call
    },
  };
}
