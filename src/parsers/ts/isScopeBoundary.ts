import * as ts from "typescript";

export function isScopeBoundary(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isModuleBlock(node) ||
    ts.isClassLike(node) ||
    ts.isFunctionLike(node) || // Catches functions, methods, arrow functions, constructors
    ts.isBlock(node) || // Catches block statements {}
    ts.isCatchClause(node) || // catch (e) {}
    // ts.isCaseBlock(node) || // case clauses in a switch actually form a block -- REMOVED
    // ts.isCaseClause(node) || // case x: individual case, might be too granular
    // ts.isDefaultClause(node) || // default: individual default, might be too granular
    ts.isForStatement(node) || // for (;;) {}
    ts.isForInStatement(node) || // for (x in y) {}
    ts.isForOfStatement(node) || // for (x of y) {}
    ts.isWhileStatement(node) || // while (true) {}
    ts.isDoStatement(node) // do {} while (true)
  );
}
