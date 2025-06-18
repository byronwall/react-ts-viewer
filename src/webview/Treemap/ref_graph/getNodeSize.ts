import type { ScopeNode } from "../../../types";

// Helper function to get node size from its ID

export function getNodeSize(node: ScopeNode): number {
  if (!node || !node.id) return Infinity;
  const parts = node.id.split(":");
  if (parts.length > 1) {
    const range = parts[parts.length - 1];
    if (range) {
      const rangeParts = range.split("-");
      if (rangeParts.length === 2 && rangeParts[0] && rangeParts[1]) {
        const start = parseInt(rangeParts[0], 10);
        const end = parseInt(rangeParts[1], 10);
        if (!isNaN(start) && !isNaN(end)) {
          return end - start;
        }
      }
    }
  }
  return Infinity; // If no range, treat as largest
}
