import { type BuildScopeTreeOptions, NodeCategory, type ScopeNode } from "../../types";

// --- END: Node Flattening and Grouping Logic ---
// --- START: Node Filtering Logic ---

export function filterNodesByOptionsRecursive(
  node: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode | null {
  // First, filter children recursively
  if (node.children && node.children.length > 0) {
    node.children = node.children
      .map((child: ScopeNode) =>
        filterNodesByOptionsRecursive({ ...child }, options)
      ) // Process cloned children, child is ScopeNode
      .filter((child: ScopeNode | null) => child !== null) as ScopeNode[]; // child is ScopeNode | null before filter
  }

  // Then, decide if the current node itself should be filtered out
  if (!options.includeImports && node.category === NodeCategory.Import) {
    return null;
  }
  if (
    !options.includeTypes &&
    (node.category === NodeCategory.TypeAlias ||
      node.category === NodeCategory.Interface)
  ) {
    return null;
  }
  if (!options.includeLiterals && node.category === NodeCategory.Literal) {
    return null;
  }

  return node;
}
