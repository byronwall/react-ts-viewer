// Utility to recursively find a node by predicate

export function findNode(node: any, pred: (n: any) => boolean): any | null {
  if (pred(node)) return node;
  if (node.children) {
    for (const c of node.children) {
      const found = findNode(c, pred);
      if (found) return found;
    }
  }
  return null;
}
