import { ScopeNode, BuildScopeTreeOptions, NodeCategory } from "../../types";
import { collapseArrowFunction } from "./collapseArrowFunction";
import { shouldCollapseArrowFunction } from "./shouldCollapseArrowFunction";
import { collapseBlockNode } from "./collapseBlockNode";
import { shouldCollapseBlock } from "./shouldCollapseBlock";

export function flattenNode(
  node: ScopeNode,
  options: Required<BuildScopeTreeOptions>
): ScopeNode {
  // Recursively process the children of the current node first.
  let processedChildren = (node.children || []).map(
    (
      child // Use 'let' to allow reassignment
    ) => flattenNode({ ...child }, options) // Creates a copy of child for processing
  );

  // New logic: If the current node `node` has exactly one processed child,
  // and that child is a Block, then "hoist" the Block's children to become direct children of `node`.
  // This is controlled by the flattenBlocks option.
  if (
    options.flattenBlocks &&
    processedChildren.length === 1 &&
    processedChildren[0] && // Ensure the child exists
    processedChildren[0].category === NodeCategory.Block
  ) {
    // The new children for the current `node` are the children of its single Block child.
    // Ensure the Block's children array exists, defaulting to an empty array if not.
    processedChildren = processedChildren[0].children || [];
  }

  // Now, apply existing collapse logic for the current `node` itself,
  // using the potentially modified list of its children (`processedChildren`).
  if (shouldCollapseBlock(node, processedChildren, options)) {
    return collapseBlockNode({ ...node }, processedChildren); // Options not passed to collapse*Node directly
  }

  if (shouldCollapseArrowFunction(node, processedChildren, options)) {
    return collapseArrowFunction({ ...node }, processedChildren); // Options not passed to collapse*Node directly
  }

  return { ...node, children: processedChildren };
}
