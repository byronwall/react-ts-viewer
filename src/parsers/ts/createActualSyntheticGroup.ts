import * as ts from "typescript";
import { ScopeNode, NodeCategory } from "../../types";

// Helper function to create a synthetic group

export function createActualSyntheticGroup(
  groupNodes: ScopeNode[],
  groupName: string, // This is the label
  parentId: string
): ScopeNode | null {
  if (groupNodes.length <= 1) return null;

  const firstNode = groupNodes[0];
  if (!firstNode) return null;

  const groupValue = 1;
  const groupId = `synthetic:${parentId}:${groupName}:${firstNode.id}`;
  const firstNodeLoc = firstNode.loc;
  const combinedSource = groupNodes.map((node) => node.source).join("\n\n");

  return {
    id: groupId,
    category: NodeCategory.SyntheticGroup,
    label: groupName, // Uses the passed groupName directly as the label
    kind: ts.SyntaxKind.Unknown,
    value: groupValue,
    loc: firstNodeLoc,
    source: combinedSource,
    children: groupNodes,
    meta: {
      syntheticGroup: true,
      contains: groupNodes.length,
      originalNodesCategories: groupNodes.map((n) => n.category),
    },
  };
}
