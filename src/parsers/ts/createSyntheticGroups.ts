import * as ts from "typescript";
import { ScopeNode } from "../../types";
import { groupRelatedNodes } from "./groupRelatedNodes";

export function createSyntheticGroups(
  rootNode: ScopeNode,
  isTopLevelCall: boolean = false,
  sourceFile?: ts.SourceFile // Optional sourceFile if needed by labeler for synthetic nodes
): ScopeNode {
  const initialChildrenToProcess = rootNode.children
    ? rootNode.children.map((c) => ({ ...c }))
    : [];

  const result = {
    ...rootNode,
    children: initialChildrenToProcess,
  };

  if (result.children.length > 0) {
    const childrenAfterRecursiveCall = result.children.map(
      (child) => createSyntheticGroups(child, false, sourceFile) // Pass sf down
    );
    result.children = groupRelatedNodes(
      childrenAfterRecursiveCall,
      result.id,
      isTopLevelCall
      // No need to pass sourceFile to groupRelatedNodes if its synthetic groups get labels directly
    );
  }
  return result;
}
