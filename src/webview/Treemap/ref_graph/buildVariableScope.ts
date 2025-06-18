import * as ts from "typescript";
import { VariableScope } from "./graph_nodes";
import { getLineAndCharacter } from "./ts_ast";
import { extractDestructuredNames } from "./ts_ast";

// Build variable scope from AST

export function buildVariableScope(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parent?: VariableScope
): VariableScope {
  const scope: VariableScope = {
    declarations: new Map(),
    parent,
    level: parent ? parent.level + 1 : 0,
  };

  const walk = (n: ts.Node): void => {
    // Variable declarations (simple identifiers)
    if (
      ts.isVariableDeclaration(n) ||
      ts.isParameter(n) ||
      ts.isFunctionDeclaration(n)
    ) {
      if (n.name && ts.isIdentifier(n.name)) {
        const name = n.name.text;
        const position = getLineAndCharacter(sourceFile, n.name.pos);
        scope.declarations.set(name, { node: n, name, line: position.line });
      }
    }

    // Destructuring patterns – capture each individual name
    if (ts.isVariableDeclaration(n) && n.name) {
      extractDestructuredNames(n.name).forEach((name) => {
        const position = getLineAndCharacter(sourceFile, n.name!.pos);
        scope.declarations.set(name, { node: n, name, line: position.line });
      });
    }

    ts.forEachChild(n, walk);
  };

  walk(node);
  return scope;
}
