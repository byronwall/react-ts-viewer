import * as ts from "typescript";
import { ScopeNode, BuildScopeTreeOptions, NodeCategory } from "../../types";

export function shouldCollapseBlock(
  node: ScopeNode,
  children: ScopeNode[],
  options: Required<BuildScopeTreeOptions>
): boolean {
  if (!options.flattenBlocks) {
    return false;
  }
  return (
    node.category === NodeCategory.Block &&
    children.every(
      (child) =>
        child.category === NodeCategory.Variable ||
        child.kind === ts.SyntaxKind.ReturnStatement
    ) &&
    children.filter((child) => child.kind === ts.SyntaxKind.ReturnStatement)
      .length <= 1
  );
}
