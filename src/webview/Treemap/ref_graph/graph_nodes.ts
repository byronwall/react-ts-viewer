import * as ts from "typescript";
import type { ScopeNode } from "../../../types";

// Helper function to find a node by name in the entire tree

export function findCommonAncestor(
  rootNode: ScopeNode,
  nodeIds: string[]
): ScopeNode {
  if (nodeIds.length === 0) return rootNode;
  if (nodeIds.length === 1) {
    const nodeId = nodeIds[0];
    if (!nodeId) return rootNode;
    const path = getPathToNode(rootNode, nodeId);
    const parentNode = path.length > 1 ? path[path.length - 2] : undefined;
    return parentNode || rootNode;
  }

  // Get paths for all nodes
  const paths = nodeIds
    .filter((id) => id != null)
    .map((id) => getPathToNode(rootNode, id));

  // Filter out empty paths
  const validPaths = paths.filter((path) => path.length > 0);
  if (validPaths.length === 0) return rootNode;

  // Find the deepest common ancestor
  let commonAncestorIndex = 0;
  const minPathLength = Math.min(...validPaths.map((p) => p.length));

  for (let i = 0; i < minPathLength; i++) {
    const firstNodeAtLevel = validPaths[0]?.[i];
    if (!firstNodeAtLevel) break;

    const allMatch = validPaths.every(
      (path) => path[i]?.id === firstNodeAtLevel.id
    );

    if (allMatch) {
      commonAncestorIndex = i;
    } else {
      break;
    }
  }

  const commonAncestor = validPaths[0]?.[commonAncestorIndex];
  return commonAncestor || rootNode;
} // Helper function to find a node by ID

export function getPathToNode(
  rootNode: ScopeNode,
  targetNodeId: string
): ScopeNode[] {
  const path: ScopeNode[] = [];

  function findPath(node: ScopeNode, currentPath: ScopeNode[]): boolean {
    const newPath = [...currentPath, node];

    if (node.id === targetNodeId) {
      path.splice(0, path.length, ...newPath);
      return true;
    }

    if (node.children) {
      for (const child of node.children) {
        if (findPath(child, newPath)) {
          return true;
        }
      }
    }

    return false;
  }

  findPath(rootNode, []);
  return path;
} // Recursively find the smallest (innermost) ScopeNode that spans the given character offset

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

export function getRangeFromNodeId(
  nodeId: string
): { start: number; end: number } | null {
  const m = nodeId.match(/:(\d+)-(\d+)$/);
  if (!m) return null;
  const start = parseInt(m[1]!, 10);
  const end = parseInt(m[2]!, 10);
  if (isNaN(start) || isNaN(end)) return null;
  return { start, end };
} // Check if a variable is declared within a scope (including parent scopes)

export function isVariableDeclaredInScope(
  varName: string,
  scope: VariableScope
): boolean {
  let currentScope: VariableScope | undefined = scope;
  while (currentScope) {
    if (currentScope.declarations.has(varName)) {
      return true;
    }
    currentScope = currentScope.parent;
  }
  return false;
}
export interface VariableScope {
  declarations: Map<string, { node: ts.Node; name: string; line: number }>;
  parent?: VariableScope;
  level: number;
}
