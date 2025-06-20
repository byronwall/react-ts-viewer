import type { ScopeNode } from "../../../types";

export function findInnermostNodeByOffset(
  node: ScopeNode,
  offset: number
): ScopeNode | null {
  const range = getRangeFromNodeId(node.id);
  if (range && (offset < range.start || offset > range.end)) {
    // Range exists and offset outside – prune branch
    return null;
  }

  let bestMatch: ScopeNode | null = node;

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      const candidate = findInnermostNodeByOffset(child, offset);
      if (candidate) {
        const candRange = getRangeFromNodeId(candidate.id);
        const bestRange = getRangeFromNodeId(bestMatch.id);
        if (candRange) {
          if (!bestRange) {
            // Current best has no range (likely the file root) – prefer any ranged child
            bestMatch = candidate;
          } else if (
            candRange.end - candRange.start <
            bestRange.end - bestRange.start
          ) {
            bestMatch = candidate;
          }
        }
      }
    }
  }

  return bestMatch;
}
// Helper: detect if a ScopeNode declares the identifier as part of a *destructuring*
// binding rather than a plain identifier declaration (e.g. `const [foo] = ...` or
// `const { foo } = ...`).  This lets downstream logic know when to nest a tiny
// leaf parameter box under the Variable declaration node.

// Helper: detect whether a ScopeNode's *source* actually CONTAINS a *usage*
// (non-declaration reference) of a given identifier.  This is more robust than
// string includes because it leverages the TypeScript AST and ignores text in
// comments / strings / unrelated identifiers.

// Extract start/end character offsets from a ScopeNode.id (format: "...:start-end")

function getRangeFromNodeId(
  nodeId: string
): { start: number; end: number } | null {
  const m = nodeId.match(/:(\d+)-(\d+)$/);
  if (!m) return null;
  const start = parseInt(m[1]!, 10);
  const end = parseInt(m[2]!, 10);
  if (isNaN(start) || isNaN(end)) return null;
  return { start, end };
}
