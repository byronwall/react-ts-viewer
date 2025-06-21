import { createActualSyntheticGroup } from "./createActualSyntheticGroup";

import { NodeCategory, type ScopeNode } from "../../types";

export function groupRelatedNodes(
  nodes: ScopeNode[],
  parentId: string,
  isTopLevel: boolean
): ScopeNode[] {
  const collectedGroups: {
    Imports: ScopeNode[];
    "Type defs": ScopeNode[];
  } = {
    Imports: [],
    "Type defs": [],
    // Hooks: [], // Removed "Hooks" group
  };
  const remainingNodes: ScopeNode[] = [];

  for (const node of nodes) {
    let assignedToGroup = false;
    if (isTopLevel) {
      if (node.category === NodeCategory.Import) {
        collectedGroups["Imports"].push(node);
        assignedToGroup = true;
      } else if (
        node.category === NodeCategory.TypeAlias ||
        node.category === NodeCategory.Interface
      ) {
        if (!assignedToGroup) {
          // Should be redundant if Import/Type/Interface are mutually exclusive categories
          collectedGroups["Type defs"].push(node);
          assignedToGroup = true;
        }
      }
    }

    if (!assignedToGroup) {
      const label = node.label;
      let isHookLike = false;
      if (node.category === NodeCategory.ReactHook) {
        isHookLike = true;
      } else if (
        node.category === NodeCategory.Call &&
        typeof label === "string" &&
        label.startsWith("use") &&
        label.length > 3
      ) {
        const charAtIndex3 = label[3]; // Access character
        if (typeof charAtIndex3 === "string" && /[A-Z]/.test(charAtIndex3)) {
          // Check if char is string and test
          isHookLike = true;
        }
      }

      if (isHookLike) {
        // Instead of adding to a "Hooks" group, add directly to remainingNodes later
        // collectedGroups["Hooks"].push(node);
        // assignedToGroup = true;
        // No longer assigning to a group, so these lines are effectively replaced by pushing to remainingNodes later
      }
    }

    if (!assignedToGroup) {
      remainingNodes.push(node);
    }
  }

  const finalResultNodes: ScopeNode[] = [];
  // Now groupOrder keys will correctly map to ScopeNode[] types in collectedGroups
  const groupOrder: Array<keyof typeof collectedGroups> = [
    "Imports",
    "Type defs",
    // "Hooks", // Removed "Hooks" from groupOrder
  ];

  for (const groupName of groupOrder) {
    const groupNodes = collectedGroups[groupName]; // groupNodes is now ScopeNode[]
    if (groupNodes.length > 0) {
      const syntheticGroup = createActualSyntheticGroup(
        groupNodes,
        groupName,
        parentId
      );
      if (syntheticGroup) {
        finalResultNodes.push(syntheticGroup);
      } else {
        // If group creation failed (e.g. <=1 node), add original nodes back.
        // These nodes would have already had their labels formatted.
        remainingNodes.push(...groupNodes); // groupNodes is ScopeNode[], spreadable
      }
    }
  }

  finalResultNodes.push(...remainingNodes);
  return finalResultNodes;
}
