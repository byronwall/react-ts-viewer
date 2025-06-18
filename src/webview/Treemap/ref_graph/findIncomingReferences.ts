import type { ScopeNode } from "../../../types";
import { type SemanticReference } from "./buildSemanticReferenceGraph";
import { type VariableScope } from "./graph_nodes";
import { buildVariableScope } from "./buildVariableScope";
import { extractSemanticReferences } from "./extractSemanticReferences";
import { createSourceFile } from "./ts_ast";

// Find incoming references to the BOI from other nodes

export function findIncomingReferences(
  focusNode: ScopeNode,
  rootNode: ScopeNode,
  boiScope: VariableScope
): SemanticReference[] {
  const incomingRefs: SemanticReference[] = [];
  const boiVariableNames = Array.from(boiScope.declarations.keys());

  if (boiVariableNames.length === 0) {
    return incomingRefs;
  }

  function searchNode(node: ScopeNode) {
    // Skip the focus node itself
    if (node.id === focusNode.id) {
      return;
    }

    if (node.source && typeof node.source === "string") {
      try {
        const sourceFile = createSourceFile(node.source);
        const nodeScope = buildVariableScope(sourceFile, sourceFile);

        // Extract references from this node
        const nodeReferences = extractSemanticReferences(
          sourceFile,
          sourceFile,
          node.id,
          nodeScope
        );

        // Check if any references point to BOI variables
        nodeReferences.forEach((ref) => {
          if (boiVariableNames.includes(ref.name) && !ref.isInternal) {
            incomingRefs.push({
              ...ref,
              direction: "incoming",
              targets: [focusNode.id],
            });
          }
        });
      } catch (error) {
        console.warn(
          `⚠️ Error analyzing node ${node.id} for incoming references:`,
          error
        );
      }
    }

    // Recursively search children
    if (node.children) {
      node.children.forEach(searchNode);
    }
  }

  searchNode(rootNode);
  return incomingRefs;
}
