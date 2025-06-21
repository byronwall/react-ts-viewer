import * as ts from "typescript";

import { NodeCategory } from "../../types";

export function collectMeta(
  node: ts.Node,
  category: NodeCategory,
  sourceFile?: ts.SourceFile
): Record<string, any> | undefined {
  if (category === NodeCategory.ReactHook && ts.isCallExpression(node)) {
    const expression = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name
      : node.expression;
    return { hookName: expression.getText(sourceFile) };
  }
  if (category === NodeCategory.ReactComponent && ts.isFunctionLike(node)) {
    return {
      props: node.parameters?.map((p) => p.name.getText(sourceFile)) ?? [],
    };
  }
  if (category === NodeCategory.Variable && ts.isVariableDeclaration(node)) {
    return {
      initializer: node.initializer
        ? node.initializer.getText(sourceFile)
        : undefined,
    };
  }
  return undefined;
}
