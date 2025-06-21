import { filterNodesByOptionsRecursive } from "./filterNodesByOptionsRecursive";

import { type BuildScopeTreeOptions, type ScopeNode } from "../../types";

export function filterNodesByOptions(
  rootNode: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  const clonedRoot = JSON.parse(JSON.stringify(rootNode)); // Simple deep clone for safety

  if (clonedRoot.children && clonedRoot.children.length > 0) {
    clonedRoot.children = clonedRoot.children
      .map((child: ScopeNode) =>
        filterNodesByOptionsRecursive({ ...child }, options)
      ) // child is ScopeNode
      .filter((child: ScopeNode | null) => child !== null) as ScopeNode[]; // child is ScopeNode | null
  }
  return clonedRoot;
}
