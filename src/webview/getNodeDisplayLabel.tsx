import { type ScopeNode } from "../types";

// Helper function to generate display labels based on node category and PRD notes
export const getNodeDisplayLabel = (nodeData: ScopeNode): string => {
  // The nodeData.label is now the pre-formatted display label from buildScopeTree.ts
  const displayLabel = nodeData.label;

  // Prepend glyph if constrained by depth
  if (nodeData.meta?.isConstrainedByDepth) {
    return `▼ ${displayLabel}`;
  }
  return displayLabel;
};
