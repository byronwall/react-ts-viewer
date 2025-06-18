import * as ts from "typescript";
import type { ScopeNode } from "../../../types";

import {
  createSourceFile,
  extractDestructuredNames,
  isIdentifierTypePosition,
  isPartOfDeclaration,
  nodeDeclaresIdentifier,
} from "./ts_ast";

// Helper function to find a node by name in the entire tree

export function findNodesByName(
  rootNode: ScopeNode,
  targetName: string
): ScopeNode[] {
  const matches: ScopeNode[] = [];

  function searchRecursively(node: ScopeNode) {
    if (node.label) {
      // Escape any regex characters in the target name once so we can safely build patterns
      const escaped = targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // 1) Exact start (fast path – common for most declarations)
      const exactStartRegex = new RegExp(`^${escaped}\\b`);

      // 2) Anywhere within the label but on *word* boundaries so we still avoid
      //    partial matches (e.g. `key` inside `monkey`). This captures array /
      //    object destructuring labels like "[foo, bar]" or "{ foo, bar }".
      const wordBoundaryRegex = new RegExp(`\\b${escaped}\\b`);

      // ----------------------------------------------------------------
      // Matching heuristics
      // ----------------------------------------------------------------
      // We want to find *proper* identifier matches while avoiding partial
      // substring hits (e.g. the word "Access" inside "verifyAccess").  A
      // match is considered valid when ONE of the following is true:
      //   1) The label *starts* with the identifier followed by a word
      //      boundary.  This covers most declarations like "password" or
      //      "handleSubmit".
      //   2) The entire label *is exactly* the identifier (rare but simple).
      //   3) The identifier appears on its own word-boundary inside the
      //      label (useful for destructuring labels such as "[foo, bar]").
      //
      // NOTE: We purposely *exclude* previously-used heuristics like
      // `label.includes("${targetName}.")` because they allowed partial
      // matches such as "Access" -> "verifyAccess.mutate", which produced
      // spurious edges to unrelated nodes.
      const isMatch =
        exactStartRegex.test(node.label) ||
        node.label === targetName ||
        wordBoundaryRegex.test(node.label);

      const declaresHere = nodeDeclaresIdentifier(node, targetName);
      const matched = isMatch || declaresHere;

      if (matched) {
        matches.push(node);
      }
    }

    // Recursively search children
    if (node.children) {
      for (const child of node.children) {
        searchRecursively(child);
      }
    }
  }

  searchRecursively(rootNode);
  return matches;
} // Helper function to find common ancestor of multiple nodes
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

export function findNodeById(
  rootNode: ScopeNode,
  nodeId: string
): ScopeNode | null {
  function searchRecursively(node: ScopeNode): ScopeNode | null {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = searchRecursively(child);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  return searchRecursively(rootNode);
} // Helper function to build hierarchical path from root to node

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
export function nodeDestructuresIdentifier(
  node: ScopeNode,
  ident: string
): boolean {
  if (!node.source || typeof node.source !== "string") return false;

  // Cheap reject – identifier not even present in source slice
  if (!node.source.includes(ident)) return false;

  let perNode = destructuringCache.get(node.id);
  if (!perNode) {
    perNode = new Map();
    destructuringCache.set(node.id, perNode);
  }
  if (perNode.has(ident)) return perNode.get(ident)!;

  let isDestructured = false;
  try {
    const sf = createSourceFile(node.source);

    const walk = (n: ts.Node): void => {
      if (isDestructured) return; // early exit once found

      if (ts.isVariableDeclaration(n) || ts.isParameter(n)) {
        const binding = n.name;
        // We only care about non-Identifier binding patterns
        if (!ts.isIdentifier(binding)) {
          const names = extractDestructuredNames(binding);
          if (names.includes(ident)) {
            isDestructured = true;
            return;
          }
        }
      }

      ts.forEachChild(n, walk);
    };

    walk(sf);
  } catch {
    // Ignore parse errors; fall back to false
  }

  perNode.set(ident, isDestructured);
  return isDestructured;
} // ---------------------------------------------------------------------------
// Helper: detect if a ScopeNode declares the identifier as part of a *destructuring*
// binding rather than a plain identifier declaration (e.g. `const [foo] = ...` or
// `const { foo } = ...`).  This lets downstream logic know when to nest a tiny
// leaf parameter box under the Variable declaration node.

const destructuringCache: Map<
  string /*nodeId*/,
  Map<string /*ident*/, boolean>
> = new Map();
export function nodeIsArrowFunctionWithParam(
  node: ScopeNode,
  ident: string
): boolean {
  if (!node.source || typeof node.source !== "string") return false;

  // Cheap reject
  if (!node.source.includes(ident)) return false;

  let perNode = arrowFnParamCache.get(node.id);
  if (!perNode) {
    perNode = new Map();
    arrowFnParamCache.set(node.id, perNode);
  }
  if (perNode.has(ident)) return perNode.get(ident)!;

  let isParam = false;
  try {
    const sf = createSourceFile(node.source);

    const walk = (n: ts.Node): void => {
      if (isParam) return;

      if (ts.isArrowFunction(n)) {
        for (const param of n.parameters) {
          if (ts.isIdentifier(param.name)) {
            if (param.name.text === ident) {
              isParam = true;
              return;
            }
          } else {
            const names = extractDestructuredNames(param.name);
            if (names.includes(ident)) {
              isParam = true;
              return;
            }
          }
        }
      }

      ts.forEachChild(n, walk);
    };

    walk(sf);
  } catch {
    // ignore parse errors
  }

  perNode.set(ident, isParam);
  return isParam;
}
export function nodeUsesIdentifier(node: ScopeNode, ident: string): boolean {
  if (!node.source || typeof node.source !== "string") return false;

  // Cheap reject – identifier not present in raw slice
  if (!node.source.includes(ident)) return false;

  let perNode = usageCache.get(node.id);
  if (!perNode) {
    perNode = new Map();
    usageCache.set(node.id, perNode);
  }
  if (perNode.has(ident)) return perNode.get(ident)!;

  let found = false;

  try {
    const sf = createSourceFile(node.source);

    const walk = (n: ts.Node): void => {
      if (found) return;

      if (
        ts.isIdentifier(n) &&
        n.text === ident &&
        !isPartOfDeclaration(n) &&
        !isIdentifierTypePosition(n)
      ) {
        // Avoid property name part of foo.bar
        if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) {
          return;
        }

        found = true;
        return;
      }

      ts.forEachChild(n, walk);
    };

    walk(sf);
  } catch {
    // ignore parse errors and fall back to false
  }

  perNode.set(ident, found);
  return found;
} // ---------------------------------------------------------------------------
// Helper: detect whether a ScopeNode's *source* actually CONTAINS a *usage*
// (non-declaration reference) of a given identifier.  This is more robust than
// string includes because it leverages the TypeScript AST and ignores text in
// comments / strings / unrelated identifiers.

const usageCache: Map<string /*nodeId*/, Map<string, boolean>> = new Map();

const arrowFnParamCache: Map<
  string /*nodeId*/,
  Map<string /*ident*/, boolean>
> = new Map(); // -------- helper utilities for locating reference usage nodes --------
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
