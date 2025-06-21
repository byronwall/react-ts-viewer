import {
  type BuildScopeTreeOptions,
  NodeCategory,
  type ScopeNode,
} from "../../types";

export function shouldCollapseArrowFunction(
  node: ScopeNode,
  children: ScopeNode[],
  options: Required<BuildScopeTreeOptions>
): boolean {
  if (!options.flattenArrowFunctions) {
    return false;
  }
  if (node.category !== NodeCategory.ArrowFunction) return false;

  // If the arrow function's direct body resulted in no significant children ScopeNodes (e.g. direct expression `() => x`)
  if (children.length === 0) return true;

  // If it has one child, and that child is a simple block (e.g. `() => { /* simple stuff */ }`)
  // Safely access children[0] and its children property
  if (children.length === 1 && children[0]?.category === NodeCategory.Block) {
    // Consider the block's children (statements within the arrow function block)
    const blockChildren = children[0]?.children || [];
    return blockChildren.length <= 3; // As per plan: ≤ 3 statements in the block
  }

  // Otherwise, if children are directly from a more complex body (not a single block that was processed)
  // This case might be less common if ArrowFunction's body is always a Block or an expression.
  // For now, stick to the plan's spirit: simple body implies few statements.
  return children.length <= 1; // Heuristic: few direct structural children means simple.
}
